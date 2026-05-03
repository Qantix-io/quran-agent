/**
 * Diagnostic OAuth2 YouTube : refresh token → access token, scopes, channels.list.
 * Lit .env via readFileSync (pas process.env) pour éviter les overrides Cursor.
 */
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { google } = require('googleapis');

const ENV_PATH = join(process.cwd(), '.env');

function parseEnvFile() {
  if (!existsSync(ENV_PATH)) {
    throw new Error(`Fichier introuvable: ${ENV_PATH}`);
  }
  const raw = readFileSync(ENV_PATH, 'utf8');
  const map = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    map[k] = v;
  }
  return map;
}

function mask(s, keep = 8) {
  if (!s || s.length <= keep * 2) return s ? '***' : '(vide)';
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

function printAxiosLikeError(err, label) {
  console.error(`\n--- ${label} ---`);
  console.error('name:', err?.name);
  console.error('message:', err?.message);
  console.error('code:', err?.code);
  if (err?.response) {
    console.error('response.status:', err.response.status);
    console.error('response.statusText:', err.response.statusText);
    console.error(
      'response.data:',
      JSON.stringify(err.response.data, null, 2),
    );
    const h = err.response.headers;
    if (h) {
      console.error(
        'response.headers (subset):',
        JSON.stringify(
          {
            'www-authenticate': h['www-authenticate'],
            'content-type': h['content-type'],
            'x-goog-...': h['x-goog-upload-url'] || undefined,
          },
          null,
          2,
        ),
      );
    }
  }
  if (Array.isArray(err?.errors)) {
    console.error('errors[]:', JSON.stringify(err.errors, null, 2));
  }
  if (err?.config) {
    console.error('request.url:', err.config.url);
    console.error('request.method:', err.config.method);
    console.error('request.baseURL:', err.config.baseURL);
  }
  console.error('stack:\n', err?.stack);
  try {
    console.error(
      'JSON.stringify(err, ownKeys):',
      JSON.stringify(err, Object.getOwnPropertyNames(err), 2),
    );
  } catch {
    console.error('(impossible de sérialiser err)');
  }
}

async function main() {
  console.log('Fichier .env:', ENV_PATH);
  const env = parseEnvFile();

  const id = env.YOUTUBE_CLIENT_ID;
  const secret = env.YOUTUBE_CLIENT_SECRET;
  const refresh = env.YOUTUBE_REFRESH_TOKEN;
  const redirect =
    env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/callback';

  console.log('\nVariables détectées (valeurs masquées):');
  console.log('  YOUTUBE_CLIENT_ID:', mask(id, 12));
  console.log('  YOUTUBE_CLIENT_SECRET:', mask(secret, 6));
  console.log('  YOUTUBE_REFRESH_TOKEN:', mask(refresh, 10));
  console.log('  YOUTUBE_REDIRECT_URI:', redirect);

  if (!id || !secret || !refresh) {
    throw new Error(
      'YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET et YOUTUBE_REFRESH_TOKEN sont requis dans .env',
    );
  }

  const oauth2Client = new google.auth.OAuth2(id, secret, redirect);
  oauth2Client.setCredentials({ refresh_token: refresh });

  console.log('\n=== 1) Rafraîchissement access token (getAccessToken) ===');
  let accessToken;
  let tokenResponse;
  try {
    const r = await oauth2Client.getAccessToken();
    accessToken = r.token;
    tokenResponse = r.res?.data;
    console.log('getAccessToken OK, token présent:', Boolean(accessToken));
    if (tokenResponse) {
      console.log(
        'Corps réponse token (champs utiles):',
        JSON.stringify(
          {
            token_type: tokenResponse.token_type,
            expires_in: tokenResponse.expires_in,
            scope: tokenResponse.scope,
            // Ne jamais logger access_token en prod ; OK pour diagnostic local
            access_token_prefix: tokenResponse.access_token
              ? String(tokenResponse.access_token).slice(0, 12) + '…'
              : undefined,
          },
          null,
          2,
        ),
      );
    }
  } catch (err) {
    printAxiosLikeError(err, 'Échec getAccessToken / refresh');
    process.exitCode = 1;
    return;
  }

  const scopesFromCreds = oauth2Client.credentials.scope;
  console.log('\n=== 2) Scopes (credentials sur le client OAuth2) ===');
  console.log('oauth2Client.credentials.scope:', scopesFromCreds || '(non renseigné côté client)');
  if (tokenResponse?.scope) {
    const list = String(tokenResponse.scope).split(/\s+/).filter(Boolean);
    console.log('Scopes dans la réponse refresh:', list);
    const need = 'https://www.googleapis.com/auth/youtube.upload';
    const hasUpload = list.some(
      (s) =>
        s === need ||
        s === 'https://www.googleapis.com/auth/youtube' ||
        s === 'https://www.googleapis.com/auth/youtube.force-ssl',
    );
    console.log(
      'Contient un scope suffisant pour upload:',
      hasUpload ? 'OUI' : 'NON — régénérer le refresh token avec youtube.upload',
    );
  }

  if (accessToken) {
    console.log('\n=== 3) tokeninfo (optionnel, scopes côté Google) ===');
    try {
      const axios = require('axios');
      const { data, status } = await axios.get(
        'https://www.googleapis.com/oauth2/v1/tokeninfo',
        { params: { access_token: accessToken }, validateStatus: () => true },
      );
      console.log('tokeninfo HTTP', status, ':', JSON.stringify(data, null, 2));
    } catch (e) {
      console.warn('tokeninfo échoué (ignoré):', e.message);
    }
  }

  console.log('\n=== 4) youtube.channels.list (mine: true) ===');
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  try {
    const ch = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      mine: true,
    });
    const items = ch.data.items || [];
    console.log('OK — nombre de chaînes:', items.length);
    for (const it of items) {
      console.log(
        ' -',
        it.id,
        '|',
        it.snippet?.title,
        '| customUrl:',
        it.snippet?.customUrl,
      );
    }
    if (items.length === 0) {
      console.warn(
        'Aucune chaîne : compte sans chaîne YouTube ou token sans scope youtube.readonly / youtube.',
      );
    }
  } catch (err) {
    printAxiosLikeError(err, 'Échec channels.list');
    process.exitCode = 1;
  }

  console.log('\n=== Fin diagnostic ===');
}

main().catch((e) => {
  printAxiosLikeError(e, 'main()');
  process.exitCode = 1;
});
