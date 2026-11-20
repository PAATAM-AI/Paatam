import { useCallback, useEffect, useState } from 'react';
import {
  School,
  Users,
  GraduationCap,
  BookOpen,
  Trophy,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  UserRound,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import './Overview.css';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';

type Score = { name: string; score: number; papers?: number };
type TrendPoint = { label: string; score: number; papers?: number };
type CampusAnalytics = {
  source: string;
  dataset: string;
  lastSync: { at: string; rows: Record<string, number> } | null;
  kpis: {
    students?: number; teachers?: number; classes?: number; sections?: number; papers?: number;
    avg_score?: number | null; last_30d?: number | null; before_30d?: number | null;
  };
  subjects: Score[];
  classes: Score[];
  trend: TrendPoint[];
  teachers: { rated: number; high: number; moderate: number; low: number; overall: number | null };
  attention: { classesBelow60: number; subjectsBelow60: number; teachersBelow60: number };
  gaps: { subject: string; area: string; score: number; answers: number }[];
};

const SUBJECT_COLORS = ['#35d58a', '#51a9ed', '#f5ca50', '#f4a33f', '#ed6262', '#933be0', '#20b9b0', '#df55a4'];
const num = (v: unknown) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const pct = (v: unknown) => (num(v) === null ? '–' : `${Math.round(Number(v))}%`);
/** Bar height for a 0–100 score on a 50–100 axis (scores under 50 show a stub). */
const barHeight = (score: number) => `${Math.max(3, Math.min(100, (score - 50) * 2))}%`;

function EmptyChart({ text }: { text: string }) {
  return <div style={{ padding: '36px 12px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>{text}</div>;
}

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  background,
  extra,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  background: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="campus-metric-card">
      <div className="campus-metric-icon" style={{ color, background }}>
        <Icon size={29} strokeWidth={1.9} />
      </div>
      <div className="campus-metric-content">
        <span className="campus-metric-title">{title}</span>
        <strong>{value}</strong>
        {extra}
      </div>
    </div>
  );
}

function AcademicTrendChart({ trend }: { trend: TrendPoint[] }) {
  if (!trend.length) return <EmptyChart text="No evaluated papers yet." />;
  const points = trend.map((t) => Number(t.score));
  const step = trend.length > 1 ? 345 / (trend.length - 1) : 0;
  const xPositions = trend.map((_, i) => (trend.length > 1 ? 70 + i * step : 240));

  // Map 50%-100% into the visible SVG plotting area (lower scores sit on the axis)
  const yPosition = (value: number) => 160 - (Math.max(50, value) - 50) * 2.7;

  const coordinates = points
    .map((point, index) => `${xPositions[index]},${yPosition(point)}`)
    .join(' ');

  const areaPoints = [
    `${xPositions[0]},160`,
    ...coordinates.split(' '),
    `${xPositions[xPositions.length - 1]},160`,
  ].join(' ');

  return (
    <svg
      className="campus-chart-svg"
      viewBox="0 0 470 205"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Average score by month"
    >
      <defs>
        <linearGradient id="academicGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c58b" stopOpacity=".28" />
          <stop offset="100%" stopColor="#22c58b" stopOpacity=".02" />
        </linearGradient>
      </defs>

      {[50, 60, 70, 80, 90, 100].map((value) => {
        const y = yPosition(value);

        return (
          <g key={value}>
            <text x="5" y={y + 4} className="campus-axis-label">
              {value}%
            </text>
            <line
              x1="48"
              y1={y}
              x2="455"
              y2={y}
              className="campus-grid-line"
            />
          </g>
        );
      })}

      <polygon points={areaPoints} fill="url(#academicGradient)" />

      <polyline
        points={coordinates}
        className="campus-trend-line"
      />

      {points.map((point, index) => (
        <g key={trend[index].label}>
          <circle
            cx={xPositions[index]}
            cy={yPosition(point)}
            r="5"
            className="campus-trend-point"
          />

          <text
            x={xPositions[index]}
            y={yPosition(point) - 12}
            textAnchor="middle"
            className="campus-chart-value"
          >
            {Math.round(point)}%
          </text>

          <text
            x={xPositions[index]}
            y="187"
            textAnchor="middle"
            className="campus-axis-label campus-x-label"
          >
            {trend[index].label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SubjectChart({ subjects }: { subjects: Score[] }) {
  if (!subjects.length) return <EmptyChart text="No subject scores yet." />;
  return (
    <div className="campus-subject-chart">
      <div className="campus-chart-y-axis">
        {[100, 90, 80, 70, 60, 50].map((value) => (
          <span key={value}>{value}%</span>
        ))}
      </div>
      <div className="campus-subject-bars">
        {subjects.map((subject, i) => (
          <div className="campus-subject-bar-column" key={subject.name} title={`${subject.papers ?? 0} papers`}>
            <strong>{Math.round(subject.score)}%</strong>
            <div className="campus-subject-bar-track">
              <div
                className="campus-subject-bar"
                style={{
                  height: barHeight(subject.score),
                  background: SUBJECT_COLORS[i % SUBJECT_COLORS.length],
                }}
              />
            </div>
            <span>{subject.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClassChart({ classes }: { classes: Score[] }) {
  if (!classes.length) return <EmptyChart text="No class scores yet." />;
  return (
    <div className="campus-class-chart">
      <div className="campus-class-y-axis">
        {[100, 90, 80, 70, 60, 50].map((value) => (
          <span key={value}>{value}%</span>
        ))}
      </div>
      <div className="campus-class-bars">
        {classes.map((item) => (
          <div className="campus-class-bar-column" key={item.name} title={`${item.papers ?? 0} papers`}>
            <strong>{Math.round(item.score)}%</strong>
            <div className="campus-class-bar-track">
              <div
                className="campus-class-bar"
                style={{ height: barHeight(item.score) }}
              />
            </div>
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeacherPerformance({ teachers }: { teachers: CampusAnalytics['teachers'] }) {
  if (!teachers.rated) return <EmptyChart text="No graded papers linked to teachers yet." />;
  const share = (n: number) => `${n} (${Math.round((n / teachers.rated) * 100)}%)`;
  const hi = (teachers.high / teachers.rated) * 100;
  const mid = hi + (teachers.moderate / teachers.rated) * 100;
  return (
    <div className="campus-teacher-performance">
      <div className="campus-donut-wrap">
        <div
          className="campus-donut"
          style={{ background: `conic-gradient(#22b66e 0 ${hi}%, #e6a52d ${hi}% ${mid}%, #ed6262 ${mid}% 100%)` }}
        >
          <div className="campus-donut-center">
            <strong>{teachers.overall ?? '–'}%</strong>
            <span>Teacher<br />Performance</span>
          </div>
        </div>
      </div>

      <div className="campus-teacher-legend">
        <div>
          <Trophy size={17} color="#22b66e" />
          <span>High Performing (≥ 80%)</span>
          <strong>{share(teachers.high)}</strong>
        </div>
        <div>
          <CheckCircle2 size={17} color="#e6a52d" />
          <span>Moderate (60% – 79%)</span>
          <strong>{share(teachers.moderate)}</strong>
        </div>
        <div>
          <AlertTriangle size={17} color="#ed6262" />
          <span>Needs Support (&lt; 60%)</span>
          <strong>{share(teachers.low)}</strong>
        </div>
      </div>
    </div>
  );
}

export default function PrincipalOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState<CampusAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notSynced, setNotSynced] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/analytics/bigquery`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        setData(body.data);
        setNotSynced(false);
      } else {
        setNotSynced(body.code === 'NOT_SYNCED');
        setError(body.message || `Analytics request failed (${res.status})`);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not reach the analytics service');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/analytics/bigquery/sync`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 429) throw new Error(body.message || `Sync failed (${res.status})`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const k = data?.kpis || {};
  const delta = num(k.last_30d) !== null && num(k.before_30d) !== null ? Number(k.last_30d) - Number(k.before_30d) : null;
  const syncedAt = data?.lastSync?.at ? new Date(data.lastSync.at).toLocaleString() : null;

  return (
    <main className="campus-overview-page">
      <div className="campus-page-heading">
        <div>
          <span className="campus-breadcrumb">Principal Dashboard</span>
          <h1>Campus Performance</h1>
          <p>
            Live from Google BigQuery ({data?.dataset || 'paatam_analytics'}), synced from AlloyDB
            {syncedAt ? ` · last sync ${syncedAt}` : ''}.
          </p>
        </div>

        <div className="campus-selector">
          <School size={23} />
          <span>{k.papers !== undefined ? `${k.papers} papers analysed` : 'Campus'}</span>
        </div>
      </div>

      <section className="campus-filter-panel">
        <button className="campus-refresh-button" onClick={handleRefresh} disabled={syncing}>
          <RefreshCw size={15} className={syncing ? 'spin' : undefined} />
          {syncing ? 'Syncing AlloyDB → BigQuery…' : 'Sync from AlloyDB & Refresh'}
        </button>
        {loading && !syncing && <span style={{ color: '#64748b', fontSize: 14 }}>Loading analytics…</span>}
        {error && (
          <span role="alert" style={{ color: '#b91c1c', fontSize: 14 }}>
            {notSynced ? 'No analytics in BigQuery yet — click “Sync from AlloyDB & Refresh”.' : error}
          </span>
        )}
      </section>

      <section className="campus-metrics-grid">
        <MetricCard
          title="Students"
          value={String(k.students ?? '–')}
          icon={Users}
          color="#20b96c"
          background="#e8faef"
        />
        <MetricCard
          title="Teachers"
          value={String(k.teachers ?? '–')}
          icon={UserRound}
          color="#933be0"
          background="#f2e9ff"
        />
        <MetricCard
          title="Classes"
          value={String(k.classes ?? '–')}
          icon={GraduationCap}
          color="#2778d7"
          background="#e8f3ff"
        />
        <MetricCard
          title="Sections"
          value={String(k.sections ?? '–')}
          icon={BookOpen}
          color="#e99b25"
          background="#fff4df"
        />
        <MetricCard
          title="Campus Avg. Score"
          value={pct(k.avg_score)}
          icon={Trophy}
          color="#df55a4"
          background="#fceafa"
          extra={
            delta !== null ? (
              <span className="campus-growth" style={delta < 0 ? { color: '#dc2626' } : undefined}>
                <ArrowUpRight size={13} style={delta < 0 ? { transform: 'rotate(90deg)' } : undefined} />
                {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% last 30 days vs earlier
              </span>
            ) : undefined
          }
        />
      </section>

      <section className="campus-charts-grid">
        <article className="campus-panel campus-large-panel">
          <div className="campus-panel-heading">
            <TrendingUp size={27} color="#15976b" />
            <div>
              <h2>Academic Performance Trend</h2>
              <p>Average score by month (all classes).</p>
            </div>
          </div>
          <AcademicTrendChart trend={data?.trend || []} />
        </article>

        <article className="campus-panel campus-large-panel">
          <div className="campus-panel-heading">
            <BookOpen size={27} color="#15976b" />
            <div>
              <h2>Subject Performance (Campus Average)</h2>
              <p>Average score by subject.</p>
            </div>
          </div>
          <SubjectChart subjects={data?.subjects || []} />
        </article>
      </section>

      <section className="campus-bottom-grid">
        <article className="campus-panel campus-bottom-panel">
          <div className="campus-panel-heading">
            <GraduationCap size={27} color="#15976b" />
            <div>
              <h2>Class Performance</h2>
              <p>Average score by class (all sections).</p>
            </div>
          </div>
          <button
            className="campus-view-button"
            onClick={() => navigate('/principal/classes')}
           >
            View Details <ArrowUpRight size={14} />
          </button>
          <ClassChart classes={data?.classes || []} />
        </article>

        <article className="campus-panel campus-bottom-panel">
          <div className="campus-panel-heading">
            <Users size={26} color="#15976b" />
            <div>
              <h2>Teacher Performance</h2>
              <p>Average score of the papers each teacher's classes wrote.</p>
            </div>
          </div>
          <button
            className="campus-view-button"
            onClick={() => navigate('/principal/teachers')}
          >
            View All Teachers <ArrowUpRight size={14} />
          </button>
          <TeacherPerformance teachers={data?.teachers || { rated: 0, high: 0, moderate: 0, low: 0, overall: null }} />
        </article>

        <article className="campus-panel campus-bottom-panel campus-attention-panel">
          <div className="campus-panel-heading">
            <AlertTriangle size={27} color="#ed6262" />
            <div>
              <h2>Needs Attention</h2>
              <p>Areas that may require your review.</p>
            </div>
          </div>

          <div className="campus-attention-list">
            <button>
              <Users size={17} />
              <span>{data?.attention.classesBelow60 ?? 0} Classes below 60% average</span>
              <ChevronDown size={16} />
            </button>
            <button>
              <TrendingUp size={17} />
              <span>{data?.attention.subjectsBelow60 ?? 0} Subjects below 60% average</span>
              <ChevronDown size={16} />
            </button>
            <button>
              <UserRound size={17} />
              <span>{data?.attention.teachersBelow60 ?? 0} Teachers' classes below 60%</span>
              <ChevronDown size={16} />
            </button>
          </div>
          {!!data?.gaps?.length && (
            <div style={{ marginTop: 14 }}>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>Weakest question areas</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: '#475569' }}>
                {data.gaps.slice(0, 5).map((g) => (
                  <li key={`${g.subject}-${g.area}`}>
                    {g.subject}: {g.area} — {Math.round(g.score)}% ({g.answers} answers)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}