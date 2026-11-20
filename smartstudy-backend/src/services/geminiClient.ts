/**
 * One place that decides how Gemini is called.
 *
 * AI_BACKEND=vertex  → Vertex AI (service account / ADC; no API key). Needs GOOGLE_CLOUD_PROJECT
 *                      and VERTEX_LOCATION (default "global").
 * otherwise          → Gemini API with GEMINI_API_KEY (the original demo behaviour).
 */
import { GoogleAuth } from 'google-auth-library';

export const useVertex = (process.env.AI_BACKEND || '').toLowerCase() === 'vertex';
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || '';
const location = process.env.VERTEX_LOCATION || 'global';

/** Truthy credential marker used by the existing "is Gemini configured?" checks. */
export function geminiCredential(): string {
  if (useVertex) return project ? 'vertex-adc' : '';
  return (process.env.GEMINI_API_KEY || '').trim();
}

export function isGeminiConfigured(): boolean {
  const c = geminiCredential();
  return Boolean(c) && !c.includes('your_gemini_api_key');
}

const auth = useVertex ? new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }) : null;

async function authHeaders(): Promise<Record<string, string>> {
  if (!auth) return {};
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return { Authorization: `Bearer ${token}` };
}

function endpoint(model: string, method: 'generateContent' | 'predict'): string {
  const m = model.replace(/^models\//, '');
  if (useVertex) {
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${m}:${method}`;
  }
  return `https://generativelanguage.googleapis.com/v1beta/models/${m}:${method === 'predict' ? 'embedContent' : method}?key=${geminiCredential()}`;
}

/** Vertex AI requires a role on every content entry; the Gemini API defaults it to "user". */
function withRoles(body: any) {
  if (!useVertex || !body || !Array.isArray(body.contents)) return body;
  return { ...body, contents: body.contents.map((c: any) => (c && !c.role ? { role: 'user', ...c } : c)) };
}

/**
 * POST a generateContent request. The body uses the Gemini API JSON shape
 * ({ contents, generationConfig, systemInstruction }), which Vertex AI also accepts.
 */
export async function geminiGenerateContent(model: string, body: any, init: { signal?: AbortSignal } = {}): Promise<Response> {
  return fetch(endpoint(model, 'generateContent'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(withRoles(body)),
    signal: init.signal,
  });
}

/**
 * Text embedding as a plain number array (or null on failure). Uses the
 * Vertex predict API or the Gemini API embedContent call, same model on both.
 */
export async function geminiEmbed(
  text: string,
  opts: { model?: string; dimensions?: number; taskType?: string; timeoutMs?: number } = {}
): Promise<number[] | null> {
  const model = opts.model || process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
  const dims = opts.dimensions || 1536;
  const signal = AbortSignal.timeout(opts.timeoutMs || 15000);
  if (useVertex) {
    const res = await fetch(endpoint(model, 'predict'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({
        instances: [{ content: text, ...(opts.taskType ? { task_type: opts.taskType } : {}) }],
        parameters: { outputDimensionality: dims },
      }),
      signal,
    });
    if (!res.ok) {
      console.warn(`⚠️ [VERTEX EMBEDDING] ${res.status}: ${(await res.text()).substring(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as any;
    const values = data?.predictions?.[0]?.embeddings?.values;
    return Array.isArray(values) ? values : null;
  }
  const res = await fetch(endpoint(model, 'predict'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      outputDimensionality: dims,
      ...(opts.taskType ? { taskType: opts.taskType } : {}),
    }),
    signal,
  });
  if (!res.ok) {
    console.warn(`⚠️ [GEMINI EMBEDDING] ${res.status}: ${(await res.text()).substring(0, 200)}`);
    return null;
  }
  const data = (await res.json()) as any;
  const values = data?.embedding?.values;
  return Array.isArray(values) ? values : null;
}

export function describeGeminiBackend() {
  return useVertex ? { backend: 'vertex-ai', project, location } : { backend: 'gemini-api', keyConfigured: isGeminiConfigured() };
}
