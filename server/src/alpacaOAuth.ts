import crypto from 'node:crypto';
import { db } from './db.js';

// Alpaca's "Connect with Alpaca" OAuth2 flow (authorization-code grant):
// the user is sent to the authorize page to approve access, comes back
// with a `code`, and the server exchanges that code for an access token
// at Alpaca's AuthX token endpoint. Alpaca OAuth access tokens don't expire
// and there is no refresh-token step, so a stored token is valid until the
// user revokes app access from their Alpaca account.
const AUTHORIZE_URL = process.env.ALPACA_OAUTH_AUTHORIZE_URL || 'https://app.alpaca.markets/oauth/authorize';
const TOKEN_URL = process.env.ALPACA_OAUTH_TOKEN_URL || 'https://authx.alpaca.markets/v1/oauth2/token';
const DEFAULT_SCOPE = 'account:write trading data';

export class AlpacaOAuthError extends Error {}

export function isOAuthConfigured(): boolean {
  return Boolean(process.env.ALPACA_OAUTH_CLIENT_ID && process.env.ALPACA_OAUTH_CLIENT_SECRET && process.env.ALPACA_OAUTH_REDIRECT_URI);
}

function requireConfig() {
  const clientId = process.env.ALPACA_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ALPACA_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.ALPACA_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new AlpacaOAuthError(
      'Alpaca OAuth is not configured. Set ALPACA_OAUTH_CLIENT_ID, ALPACA_OAUTH_CLIENT_SECRET, ' +
        'and ALPACA_OAUTH_REDIRECT_URI (from your app registration at https://app.alpaca.markets/brokerage/apps).'
    );
  }
  return { clientId, clientSecret, redirectUri };
}

// Short-lived in-memory CSRF state store. This is a single-user local app
// with no session/cookie layer, so the state token itself is the only
// thing tying an authorize redirect to its callback.
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function pruneExpiredStates() {
  const now = Date.now();
  for (const [state, issuedAt] of pendingStates) {
    if (now - issuedAt > STATE_TTL_MS) pendingStates.delete(state);
  }
}

export function buildAuthorizeUrl(): string {
  const { clientId, redirectUri } = requireConfig();
  pruneExpiredStates();

  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, Date.now());

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', process.env.ALPACA_OAUTH_SCOPE || DEFAULT_SCOPE);
  url.searchParams.set('state', state);
  return url.toString();
}

export function consumeState(state: string | undefined): boolean {
  if (!state) return false;
  pruneExpiredStates();
  return pendingStates.delete(state);
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  const { clientId, clientSecret, redirectUri } = requireConfig();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AlpacaOAuthError(`Alpaca token exchange failed (${res.status}): ${text || res.statusText}`);
  }

  const token = (await res.json()) as TokenResponse;
  if (!token.access_token) {
    throw new AlpacaOAuthError('Alpaca token exchange response did not include an access_token');
  }

  db.prepare(
    `INSERT INTO alpaca_connection (id, access_token, token_type, scope, connected_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       access_token = excluded.access_token,
       token_type = excluded.token_type,
       scope = excluded.scope,
       connected_at = excluded.connected_at`
  ).run(token.access_token, token.token_type || 'Bearer', token.scope ?? null, new Date().toISOString());
}

interface AlpacaConnectionRow {
  access_token: string;
  token_type: string;
  scope: string | null;
  connected_at: string;
}

export function getConnection(): AlpacaConnectionRow | undefined {
  return db.prepare('SELECT access_token, token_type, scope, connected_at FROM alpaca_connection WHERE id = 1').get() as
    | AlpacaConnectionRow
    | undefined;
}

export function disconnect(): void {
  db.prepare('DELETE FROM alpaca_connection WHERE id = 1').run();
}
