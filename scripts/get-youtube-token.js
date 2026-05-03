const { google } = require('googleapis');
const http = require('http');
const url = require('url');

require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'http://localhost:3000/callback'
);

const scopes = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent',
});

console.log('👉 Ouvre cette URL dans ton navigateur:');
console.log(authUrl);
console.log('');

const server = http.createServer(async (req, res) => {
  const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
  const code = qs.get('code');
  if (!code) {
    res.end('Pas de code');
    return;
  }
  const { tokens } = await oauth2Client.getToken(code);
  console.log('');
  console.log('✅ YOUTUBE_REFRESH_TOKEN=', tokens.refresh_token);
  console.log('');
  console.log('👉 Copie cette valeur dans ton .env');
  res.end('Token récupéré ! Tu peux fermer cette fenêtre.');
  server.close();
});

server.listen(3000, () => {
  console.log('Serveur en attente sur http://localhost:3000/callback...');
});