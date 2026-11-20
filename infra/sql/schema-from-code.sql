-- Paatam.ai schema for AlloyDB / PostgreSQL, derived from the backend code.
-- Use this ONLY if the original Supabase project can't be dumped (infra/migrate-db.sh is preferred:
-- it copies the exact schema and the demo data). Idempotent.
-- Ids are TEXT: the app writes ids such as 'teacher-1731...' and relies on DB defaults elsewhere.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS corporate (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  registration_no text UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  corporate_id text REFERENCES corporate(id) ON DELETE CASCADE,
  name text NOT NULL,
  pincode text, address text, branch_contact_mail text, mobile_number text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admins (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_name text, contact_email text UNIQUE, mobile text, role text DEFAULT 'OTHER',
  password_hash text, created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_branch_access (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  admin_id text REFERENCES admins(id) ON DELETE CASCADE,
  branch_id text REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE (admin_id, branch_id)
);

CREATE TABLE IF NOT EXISTS academic_years (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  branch_id text REFERENCES branches(id) ON DELETE CASCADE,
  start_year int, end_year int, is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (branch_id, start_year)
);

CREATE TABLE IF NOT EXISTS classes (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text, section text,
  branch_id text REFERENCES branches(id) ON DELETE CASCADE,
  academic_year_id text REFERENCES academic_years(id) ON DELETE SET NULL,
  class_order int,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  branch_id text REFERENCES branches(id) ON DELETE SET NULL,
  name text, teacher_id text, contact_email text UNIQUE, contact_mobile text,
  password_hash text, created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS section (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_id text REFERENCES classes(id) ON DELETE CASCADE,
  section_name text, class_teacher_id text REFERENCES teacher(id) ON DELETE SET NULL,
  strength int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (class_id, section_name)
);

CREATE TABLE IF NOT EXISTS subjects (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text UNIQUE, description text, grade text, board text, class_name text,
  branch_id text REFERENCES branches(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_subjects (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_id text REFERENCES classes(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE CASCADE,
  subject_name text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (class_id, subject_name)
);

CREATE TABLE IF NOT EXISTS teacher_subject (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id text REFERENCES teacher(id) ON DELETE CASCADE,
  subject_id text REFERENCES subjects(id) ON DELETE CASCADE,
  class_subject_id text, section_id text, branch_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (teacher_id, subject_id)
);

CREATE TABLE IF NOT EXISTS parents (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text, phone_number text UNIQUE, email text, preferred_channel text DEFAULT 'whatsapp',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text, roll_number text, admission_no text,
  class_id text REFERENCES classes(id) ON DELETE SET NULL,
  section_id text REFERENCES section(id) ON DELETE SET NULL,
  parent_id text REFERENCES parents(id) ON DELETE SET NULL,
  contact_email text, contact_mobile text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title text, class_name text, subject text,
  language text DEFAULT 'English', difficulty text DEFAULT 'Medium', duration_minutes int DEFAULT 60,
  questions_json jsonb DEFAULT '[]'::jsonb, reasoning_model text, status text DEFAULT 'dispatched',
  class_id text, class_subject_id text, section_id text, teacher_subject_id text,
  answer_key_text text, question_paper_url text, answer_key_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  assignment_id text REFERENCES assignments(id) ON DELETE CASCADE,
  student_id text REFERENCES students(id) ON DELETE SET NULL,
  student_name text, subject text, language text DEFAULT 'English', lang_code text,
  sample_paper_url text, sample_paper_urls jsonb DEFAULT '[]'::jsonb, ocr_text text,
  score numeric, max_score numeric, feedback text, socratic_hint text,
  evaluation_provider text, evaluation_status text, fallback_reason text,
  ai_evaluation_json jsonb, status text DEFAULT 'pending_review',
  final_score numeric, final_feedback text, final_hint text, final_evaluation_json jsonb,
  submitted_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type text, title text, message text, details_json jsonb, "timestamp" timestamptz DEFAULT now(),
  student_name text, student_id text, parent_phone text,
  delivery_status text DEFAULT 'pending', provider_message_id text
);

CREATE TABLE IF NOT EXISTS curriculum_chapters (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_name text, subject_name text DEFAULT 'General', chapter_number int, chapter_title text,
  subtopics jsonb DEFAULT '[]'::jsonb, chunk_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (class_name, subject_name, chapter_number)
);

CREATE TABLE IF NOT EXISTS curriculum_topics (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_name text, unit_number int, unit_name text, topic_name text,
  subtopics jsonb DEFAULT '[]'::jsonb, prescribed_weightage numeric DEFAULT 5,
  page_start int, page_end int,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS textbook_embeddings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_name text, subject_name text, chapter_title text, unit_name text, topic_name text,
  content_chunk text, embedding vector(1536),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submissions_assignment_idx ON submissions (assignment_id, status);
CREATE INDEX IF NOT EXISTS submissions_student_idx ON submissions (student_id);
CREATE INDEX IF NOT EXISTS students_class_idx ON students (class_id, section_id);
CREATE INDEX IF NOT EXISTS textbook_embeddings_class_idx ON textbook_embeddings (class_name);
CREATE INDEX IF NOT EXISTS textbook_embeddings_hnsw ON textbook_embeddings USING hnsw (embedding vector_cosine_ops);

-- Vector search used by RAG (same names and parameters the backend calls)
CREATE OR REPLACE FUNCTION match_textbook_chunks(
  query_embedding vector(1536), match_threshold float, match_count int, filter_class_name text DEFAULT NULL
) RETURNS TABLE (id text, class_name text, chapter_title text, topic_name text, unit_name text,
                 content_chunk text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT e.id, e.class_name, e.chapter_title, e.topic_name, e.unit_name, e.content_chunk,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM textbook_embeddings e
  WHERE (filter_class_name IS NULL OR e.class_name = filter_class_name)
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION match_topic_textbook_chunks(
  query_embedding vector(1536), match_threshold float, match_count int,
  filter_class_name text DEFAULT NULL, filter_topic_name text DEFAULT NULL
) RETURNS TABLE (id text, class_name text, chapter_title text, topic_name text, unit_name text,
                 content_chunk text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT e.id, e.class_name, e.chapter_title, e.topic_name, e.unit_name, e.content_chunk,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM textbook_embeddings e
  WHERE (filter_class_name IS NULL OR e.class_name = filter_class_name)
    AND (filter_topic_name IS NULL OR e.topic_name ILIKE '%' || filter_topic_name || '%')
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
