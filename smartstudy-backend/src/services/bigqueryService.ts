/**
 * BigQuery analytics: AlloyDB (operational) → BigQuery (analytical) sync and dashboard queries.
 *
 * Sync = full refresh per table (WRITE_TRUNCATE load jobs from NDJSON), plus a flattened
 * submission_questions table built from each submission's per-question evaluation.
 * Views are (re)created on every sync so the SQL lives in one place.
 */
import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { supabase, isDbConfigured } from '../db/supabase.js';

const datasetId = process.env.BQ_DATASET || 'paatam_analytics';
const location = process.env.BQ_LOCATION || 'asia-south1';
const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || undefined;

export function isBigQueryConfigured(): boolean {
  return Boolean(process.env.BQ_DATASET || process.env.GOOGLE_CLOUD_PROJECT);
}

let bq: BigQuery | null = null;
const client = () => (bq = bq || new BigQuery({ projectId, location }));

/** Tables copied as-is (large or sensitive columns removed). */
const TABLES: Record<string, string[]> = {
  corporate: [],
  branches: [],
  classes: [],
  section: [],
  subjects: [],
  class_subjects: [],
  teacher: ['password_hash'],
  teacher_subject: [],
  students: ['password_hash'],
  assignments: ['questions_json', 'answer_key_text'],
  submissions: ['ocr_text', 'sample_paper_urls', 'ai_evaluation_json', 'final_evaluation_json'],
  curriculum_chapters: [],
  curriculum_topics: [],
};

async function fetchAll(table: string): Promise<any[]> {
  const rows: any[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return rows;
}

/**
 * Every column is loaded as STRING with an explicit schema: ids in this database mix
 * bigint and text, and autodetect would otherwise guess conflicting types. Views cast.
 */
function toRow(row: any, drop: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(row)) {
    if (drop.includes(k) || k === 'embedding') continue;
    out[k] = v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}

/** Columns the views need even when a table is still empty. */
const REQUIRED_COLUMNS: Record<string, string[]> = {
  students: ['id'], teacher: ['id'], classes: ['id', 'name'], section: ['id'],
  teacher_subject: ['id', 'teacher_id'],
  assignments: ['id', 'class_id', 'class_name', 'section_id', 'teacher_subject_id'],
  submissions: ['id', 'assignment_id', 'student_id', 'subject', 'status', 'score', 'final_score', 'max_score', 'submitted_at'],
  submission_questions: ['submission_id', 'assignment_id', 'student_id', 'subject', 'question_no', 'topic', 'max_marks', 'earned_marks', 'status', 'submitted_at'],
};

function parseJson(v: any): any {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

/** One row per evaluated question, from the teacher's final evaluation if present, else the AI's. */
function questionRows(sub: any): Record<string, string | null>[] {
  const pick = (v: any) => {
    const j = parseJson(v);
    if (Array.isArray(j)) return j;
    if (j && Array.isArray(j.questionEvaluations)) return j.questionEvaluations;
    if (j && Array.isArray(j.question_evaluations)) return j.question_evaluations;
    return null;
  };
  const items = pick(sub.final_evaluation_json) || pick(sub.ai_evaluation_json) || [];
  return items.map((q: any, i: number) => {
    const max = Number(q?.marks ?? q?.max_marks ?? q?.maxMarks);
    const earned = Number(q?.earnedMarks ?? q?.marks_awarded ?? q?.awarded_marks ?? q?.score);
    return toRow({
      submission_id: sub.id,
      assignment_id: sub.assignment_id,
      student_id: sub.student_id,
      subject: sub.subject,
      question_no: String(q?.questionNo ?? q?.question_number ?? i + 1),
      topic: q?.topic ?? q?.chapter ?? null,
      max_marks: Number.isFinite(max) ? max : null,
      earned_marks: Number.isFinite(earned) ? earned : null,
      status: q?.status ?? null,
      submitted_at: sub.submitted_at,
    }, []);
  });
}

async function loadTable(table: string, rows: Record<string, string | null>[]) {
  const ds = client().dataset(datasetId);
  const columns = new Set<string>(REQUIRED_COLUMNS[table] || []);
  for (const r of rows) Object.keys(r).forEach((k) => columns.add(k));
  if (columns.size === 0) columns.add('id');
  const schema = { fields: [...columns].map((name) => ({ name, type: 'STRING', mode: 'NULLABLE' })) };
  const file = path.join(os.tmpdir(), `bq-${table}-${Date.now()}.ndjson`);
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n'));
  try {
    await ds.table(table).load(file, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: 'WRITE_TRUNCATE',
      schema,
      location,
    });
    return rows.length;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

const VIEWS: Record<string, string> = {
  v_submission_scores: `
    SELECT s.id, s.student_id, s.subject, s.status,
      SAFE_CAST(s.submitted_at AS TIMESTAMP) AS submitted_at,
      COALESCE(c.name, a.class_name) AS class_name, a.section_id, a.teacher_subject_id,
      SAFE_DIVIDE(COALESCE(SAFE_CAST(s.final_score AS FLOAT64), SAFE_CAST(s.score AS FLOAT64)),
                  NULLIF(SAFE_CAST(s.max_score AS FLOAT64), 0)) * 100 AS pct
    FROM \`{ds}.submissions\` s
    LEFT JOIN \`{ds}.assignments\` a ON a.id = s.assignment_id
    LEFT JOIN \`{ds}.classes\` c ON c.id = a.class_id
    WHERE s.status != 'failed'`,
  v_subject_performance: `
    SELECT subject AS name, ROUND(AVG(pct), 1) AS score, COUNT(*) AS papers
    FROM \`{ds}.v_submission_scores\` WHERE pct IS NOT NULL AND subject IS NOT NULL
    GROUP BY subject ORDER BY papers DESC`,
  v_class_performance: `
    SELECT class_name AS name, ROUND(AVG(pct), 1) AS score, COUNT(*) AS papers
    FROM \`{ds}.v_submission_scores\` WHERE pct IS NOT NULL AND class_name IS NOT NULL
    GROUP BY class_name ORDER BY class_name`,
  v_monthly_trend: `
    SELECT FORMAT_TIMESTAMP('%b %Y', TIMESTAMP_TRUNC(submitted_at, MONTH)) AS label,
      TIMESTAMP_TRUNC(submitted_at, MONTH) AS month, ROUND(AVG(pct), 1) AS score, COUNT(*) AS papers
    FROM \`{ds}.v_submission_scores\` WHERE pct IS NOT NULL AND submitted_at IS NOT NULL
    GROUP BY label, month ORDER BY month`,
  v_teacher_performance: `
    SELECT ts.teacher_id, ROUND(AVG(v.pct), 1) AS score, COUNT(*) AS papers
    FROM \`{ds}.v_submission_scores\` v
    JOIN \`{ds}.teacher_subject\` ts ON ts.id = v.teacher_subject_id
    WHERE v.pct IS NOT NULL GROUP BY ts.teacher_id`,
  v_question_gaps: `
    SELECT subject, COALESCE(topic, CONCAT('Q', question_no)) AS area,
      ROUND(AVG(SAFE_DIVIDE(SAFE_CAST(earned_marks AS FLOAT64), NULLIF(SAFE_CAST(max_marks AS FLOAT64), 0))) * 100, 1) AS score,
      COUNT(*) AS answers
    FROM \`{ds}.submission_questions\` WHERE SAFE_CAST(max_marks AS FLOAT64) > 0
    GROUP BY subject, area HAVING answers >= 3 ORDER BY score ASC LIMIT 20`,
};

async function createViews() {
  const ds = `${client().projectId}.${datasetId}`;
  for (const [name, sql] of Object.entries(VIEWS)) {
    await client().query({
      query: `CREATE OR REPLACE VIEW \`${ds}.${name}\` AS ${sql.replaceAll('{ds}', ds)}`,
      location,
    });
  }
}

let lastSync: { at: string; rows: Record<string, number> } | null = null;

export async function syncToBigQuery() {
  if (!isDbConfigured()) throw new Error('Database is not configured');
  const counts: Record<string, number> = {};
  let submissions: any[] = [];
  for (const [table, drop] of Object.entries(TABLES)) {
    const raw = await fetchAll(table);
    if (table === 'submissions') submissions = raw;
    counts[table] = await loadTable(table, raw.map((r) => toRow(r, drop)));
  }
  counts.submission_questions = await loadTable('submission_questions', submissions.flatMap(questionRows));
  await createViews();
  lastSync = { at: new Date().toISOString(), rows: counts };
  cache = null;
  return lastSync;
}

let cache: { at: number; data: any } | null = null;

async function rows<T = any>(sql: string): Promise<T[]> {
  const ds = `${client().projectId}.${datasetId}`;
  const [r] = await client().query({ query: sql.replaceAll('{ds}', ds), location });
  return r as T[];
}

/** Everything the Principal Overview needs, in one round of queries (cached 60 s). */
export async function getCampusAnalytics() {
  if (cache && Date.now() - cache.at < 60_000) return cache.data;
  const one = async (sql: string) => (await rows(sql))[0] || {};
  const [counts, overall, subjects, classes, trend, teachers, gaps] = await Promise.all([
    one(`SELECT
      (SELECT COUNT(*) FROM \`{ds}.students\`) AS students,
      (SELECT COUNT(*) FROM \`{ds}.teacher\`) AS teachers,
      (SELECT COUNT(*) FROM \`{ds}.classes\`) AS classes,
      (SELECT COUNT(*) FROM \`{ds}.section\`) AS sections,
      (SELECT COUNT(*) FROM \`{ds}.submissions\`) AS papers`),
    one(`SELECT ROUND(AVG(pct), 1) AS avg_score,
      ROUND(AVG(IF(submitted_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), pct, NULL)), 1) AS last_30d,
      ROUND(AVG(IF(submitted_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), pct, NULL)), 1) AS before_30d
      FROM \`{ds}.v_submission_scores\` WHERE pct IS NOT NULL`),
    rows(`SELECT * FROM \`{ds}.v_subject_performance\` LIMIT 8`),
    rows(`SELECT * FROM \`{ds}.v_class_performance\``),
    rows(`SELECT label, score, papers FROM \`{ds}.v_monthly_trend\` ORDER BY month DESC LIMIT 6`),
    rows(`SELECT * FROM \`{ds}.v_teacher_performance\``),
    rows(`SELECT * FROM \`{ds}.v_question_gaps\``),
  ]);
  const t = teachers as any[];
  const data = {
    source: 'bigquery',
    dataset: datasetId,
    lastSync,
    kpis: { ...counts, ...overall },
    subjects,
    classes,
    trend: (trend as any[]).reverse(),
    teachers: {
      rated: t.length,
      high: t.filter((x) => x.score >= 80).length,
      moderate: t.filter((x) => x.score >= 60 && x.score < 80).length,
      low: t.filter((x) => x.score < 60).length,
      overall: t.length ? Math.round(t.reduce((n, x) => n + Number(x.score), 0) / t.length) : null,
    },
    attention: {
      classesBelow60: (classes as any[]).filter((c) => c.score < 60).length,
      subjectsBelow60: (subjects as any[]).filter((s) => s.score < 60).length,
      teachersBelow60: t.filter((x) => x.score < 60).length,
    },
    gaps,
  };
  cache = { at: Date.now(), data };
  return data;
}
