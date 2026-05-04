const http = require('http');
const crypto = require('crypto');
const { readFileSync } = require('fs');

const raw = readFileSync('.env', 'utf8');
const clientKey = raw.match(/TIKTOK_CLIENT_KEY=(.+)/)?.[1]?.trim();
const clientSecret = raw.match(/TIKTOK_CLIENT_SECRET=(.+)/)?.[1]?.trim();

// Génération PKCE
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&response_type=code&scope=user.info.basic,video.publish,video.upload&redirect_uri=http://localhost:3000/callback&state=quran&code_challenge=${codeChallenge}&code_challenge_method=S256`;

console.log('👉 Ouvre cette URL dans ton navigateur:');
console.log(authUrl);
console.log('');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  const code = url.searchParams.get('code');
  if (!code) { res.end('Pas de code'); return; }

  const params = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: 'http://localhost:3000/callback',
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await tokenRes.json();
  console.log('');
  console.log('✅ TIKTOK_ACCESS_TOKEN=', data.access_token);
  console.log('📋 Refresh Token:', data.refresh_token);
  console.log('⏱️  Expire dans:', data.expires_in, 'secondes');
  res.end('Token TikTok récupéré ! Tu peux fermer cette fenêtre.');
  server.close();
});

server.listen(3000, () => {
  console.log('Serveur en attente sur http://localhost:3000/callback...');
});