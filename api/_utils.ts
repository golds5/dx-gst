// Shared helpers for the Vercel API functions. The service account is the
// only Google identity in the system — VAs do not sign in. Credentials come
// from two environment variables set in the Vercel project:
//   GOOGLE_SA_EMAIL        service account email
//   GOOGLE_SA_PRIVATE_KEY  the "private_key" value from the SA's JSON key
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES =
  'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';

let cached: { token: string; exp: number } | null = null;

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

export async function saAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.exp - 60_000) return cached.token;
  const email = process.env.GOOGLE_SA_EMAIL;
  const key = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error(
      'Server is missing GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY environment variables',
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({ iss: email, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${signer.sign(key, 'base64url')}`;

  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    throw new Error(
      `Service-account token exchange failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`,
    );
  }
  const data = (await resp.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

export async function gFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await saAccessToken();
  return fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

export async function apiError(prefix: string, resp: Response): Promise<Error> {
  let detail = '';
  try {
    const body = (await resp.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? '';
  } catch {
    // non-JSON body
  }
  return new Error(`${prefix} (${resp.status}${detail ? `: ${detail}` : ''})`);
}

// Minimal req/res typing to avoid a dependency on @vercel/node.
export type ApiRequest = {
  method?: string;
  body?: unknown;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
};
export type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): void;
};

export function handleError(res: ApiResponse, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  res.status(500).json({ error: message });
}
