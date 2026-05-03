"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAlert = sendAlert;
const node_https_1 = __importDefault(require("node:https"));
const node_url_1 = require("node:url");
const logger_js_1 = __importDefault(require("./logger.js"));
function postJson(url, body) {
    return new Promise((resolve) => {
        const u = new node_url_1.URL(url);
        const payload = JSON.stringify(body);
        const req = node_https_1.default.request({
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (res) => {
            res.resume();
            res.on('end', () => resolve());
        });
        req.on('error', () => resolve());
        req.write(payload);
        req.end();
    });
}
/**
 * Envoie une alerte Telegram. Ne propage jamais d'erreur (ne doit pas faire crasher le pipeline).
 */
async function sendAlert(message) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        logger_js_1.default.debug('Telegram: TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant, alerte ignorée');
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await postJson(url, { chat_id: chatId, text: message });
    }
    catch {
        /* silencieux */
    }
}
//# sourceMappingURL=telegram.js.map