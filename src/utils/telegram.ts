import https from 'node:https';
import { URL } from 'node:url';
import logger from './logger.js';

function postJson(url: string, body: object): Promise<void> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve());
      },
    );
    req.on('error', () => resolve());
    req.write(payload);
    req.end();
  });
}

/**
 * Envoie une alerte Telegram. Ne propage jamais d'erreur (ne doit pas faire crasher le pipeline).
 */
export async function sendAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    logger.debug('Telegram: TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant, alerte ignorée');
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await postJson(url, { chat_id: chatId, text: message });
  } catch {
    /* silencieux */
  }
}
