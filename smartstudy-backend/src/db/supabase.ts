/**
 * Data access layer.
 *
 * Google Cloud mode (POSTGREST_URL set):
 *   - tables and SQL functions: PostgREST (sidecar container) in front of AlloyDB for PostgreSQL,
 *     so every `supabase.from(...)` / `supabase.rpc(...)` call in the codebase works unchanged;
 *   - files: Cloud Storage (GCS_BUCKET), served back through GET /api/files/<bucket>/<path>;
 *   - auth tokens: HS256 JWTs signed with APP_JWT_SECRET.
 * Legacy mode (SUPABASE_URL + SUPABASE_ANON_KEY): the original Supabase project.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { Storage } from '@google-cloud/storage';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const postgrestUrl = (process.env.POSTGREST_URL || '').replace(/\/+$/, '');
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

export const dataBackend: 'alloydb' | 'supabase' | 'none' = postgrestUrl
  ? 'alloydb'
  : supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project')
    ? 'supabase'
    : 'none';

/** True when a database is configured (AlloyDB via PostgREST, or legacy Supabase). */
export function isDbConfigured(): boolean {
  return dataBackend !== 'none';
}

/** Files are stored under "<logical bucket>/<path>" inside one private GCS bucket. */
export const FILE_ROUTE_PREFIX = '/api/files';
const gcsBucketName = process.env.GCS_BUCKET || '';
let gcs: Storage | null = null;
function gcsBucket() {
  if (!gcsBucketName) throw new Error('GCS_BUCKET is not configured');
  gcs = gcs || new Storage();
  return gcs.bucket(gcsBucketName);
}

/** Minimal Supabase-Storage-compatible facade over Cloud Storage (upload, getPublicUrl, remove). */
const gcsStorage = {
  from(bucket: string) {
    return {
      async upload(path: string, body: Buffer, opts: { contentType?: string; upsert?: boolean } = {}) {
        try {
          await gcsBucket().file(`${bucket}/${path}`).save(body, {
            contentType: opts.contentType || 'application/octet-stream',
            resumable: false,
          });
          return { data: { path }, error: null };
        } catch (err: any) {
          return { data: null, error: { message: err?.message || String(err) } };
        }
      },
      getPublicUrl(path: string) {
        // Relative URL: the web app proxies /api to the API service, which streams the object.
        return { data: { publicUrl: `${FILE_ROUTE_PREFIX}/${bucket}/${path}` } };
      },
      async remove(paths: string[]) {
        try {
          await Promise.all(paths.map((p) => gcsBucket().file(`${bucket}/${p}`).delete({ ignoreNotFound: true })));
          return { data: paths, error: null };
        } catch (err: any) {
          return { data: null, error: { message: err?.message || String(err) } };
        }
      },
    };
  },
};

/** Reads an uploaded object for GET /api/files/*. Only logical buckets the app writes to are served. */
export const SERVED_BUCKETS = new Set(['student-submissions', 'question-papers', 'answer-keys', 'textbooks', 'diagrams']);
export function openStoredFile(objectPath: string) {
  const bucket = objectPath.split('/')[0];
  if (!SERVED_BUCKETS.has(bucket) || objectPath.includes('..')) return null;
  return gcsBucket().file(objectPath);
}

const appJwtSecret = process.env.APP_JWT_SECRET || '';
const gcpAuth = {
  async getUser(token: string) {
    if (!appJwtSecret) return { data: { user: null }, error: { message: 'APP_JWT_SECRET not configured' } };
    try {
      const claims = jwt.verify(token, appJwtSecret) as any;
      const user = { id: String(claims.sub), email: claims.email, user_metadata: claims };
      return { data: { user }, error: null };
    } catch (err: any) {
      return { data: { user: null }, error: { message: err?.message || 'invalid token' } };
    }
  },
};

function createGcpClient(): SupabaseClient {
  const pgrstSecret = process.env.PGRST_JWT_SECRET || '';
  if (!pgrstSecret) throw new Error('PGRST_JWT_SECRET must be set when POSTGREST_URL is used');
  // PostgREST switches to this database role for every request from the API.
  const serviceToken = jwt.sign({ role: process.env.PGRST_API_ROLE || 'paatam_api' }, pgrstSecret, { algorithm: 'HS256' });
  const rest = new PostgrestClient(postgrestUrl, { headers: { Authorization: `Bearer ${serviceToken}` } });
  const client = {
    from: (relation: string) => rest.from(relation),
    rpc: (fn: string, args?: Record<string, unknown>, options?: any) => rest.rpc(fn, args, options),
    schema: (name: string) => rest.schema(name),
    storage: gcsStorage,
    auth: gcpAuth,
  };
  return client as unknown as SupabaseClient;
}

if (dataBackend === 'none') {
  console.warn('⚠️ No database configured: set POSTGREST_URL (Google Cloud) or SUPABASE_URL + SUPABASE_ANON_KEY.');
} else {
  console.log(`🗄️ Data backend: ${dataBackend === 'alloydb' ? `AlloyDB via PostgREST (${postgrestUrl})` : 'Supabase'}`);
}

export const supabase: SupabaseClient =
  dataBackend === 'alloydb'
    ? createGcpClient()
    : createClient(supabaseUrl || 'http://localhost:54321', supabaseAnonKey || 'missing-key');

/**
 * Upload a file buffer and return the URL the frontend uses to display it.
 * Falls back to a Base64 data URL only if storage is unavailable (legacy behaviour).
 */
export async function uploadImageToSupabase(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string = 'image/jpeg',
  folder: string = 'submissions',
  bucketName: string = 'student-submissions'
): Promise<string> {
  const base64DataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;

  try {
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `${folder}/${Date.now()}-${cleanFileName}`;

    const { error } = await supabase.storage.from(bucketName).upload(filePath, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    });

    if (error) {
      console.warn('⚠️ Storage upload notice (using Base64 Data URL fallback):', error.message);
      return base64DataUrl;
    }

    const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
    if (publicUrlData && publicUrlData.publicUrl) {
      console.log(`✅ File stored: ${publicUrlData.publicUrl}`);
      return publicUrlData.publicUrl;
    }

    return base64DataUrl;
  } catch (err: any) {
    console.warn('⚠️ Upload exception (using Base64 Data URL fallback):', err?.message || err);
    return base64DataUrl;
  }
}
