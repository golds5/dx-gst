// Google Identity Services (GIS) token client wrapper.
// Token lives in memory only; when it expires we silently re-request one
// (Section 8: token expiry mid-upload must not lose the upload).

import { OAUTH_CLIENT_ID, OAUTH_SCOPES } from '../config';

type TokenClient = {
  requestAccessToken(opts?: { prompt?: string }): void;
  callback: (resp: TokenResponse) => void;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
          }): TokenClient;
        };
      };
    };
  }
}

let gisLoaded: Promise<void> | null = null;
let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms

function loadGis(): Promise<void> {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return gisLoaded;
}

async function getClient(): Promise<TokenClient> {
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: OAUTH_CLIENT_ID,
      scope: OAUTH_SCOPES,
      callback: () => {}, // replaced per-request
    });
  }
  return tokenClient;
}

function requestToken(prompt: '' | 'consent'): Promise<string> {
  return getClient().then(
    (client) =>
      new Promise<string>((resolve, reject) => {
        client.callback = (resp) => {
          if (resp.error || !resp.access_token) {
            reject(new Error(`Google sign-in failed: ${resp.error ?? 'no token'}`));
            return;
          }
          accessToken = resp.access_token;
          tokenExpiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
          resolve(accessToken);
        };
        client.requestAccessToken({ prompt });
      }),
  );
}

// Valid token, silently refreshing if expired / about to expire.
export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;
  return requestToken('');
}

export async function interactiveSignIn(): Promise<{ email: string }> {
  const token = await requestToken('consent');
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error('Could not read signed-in account info');
  const info = (await resp.json()) as { email?: string };
  return { email: info.email ?? '(unknown account)' };
}

// Authorized fetch against Google APIs with one automatic retry after a
// silent token refresh on 401.
export async function gFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = async (token: string) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  let resp = await doFetch(await getAccessToken());
  if (resp.status === 401) {
    accessToken = null; // force refresh
    resp = await doFetch(await getAccessToken());
  }
  return resp;
}
