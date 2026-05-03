"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadAudio = downloadAudio;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
const CDN_BASE = 'https://cdn.islamic.network/quran/audio/128/ar.alafasy';
function ensureFfmpeg() {
    try {
        (0, node_child_process_1.execSync)('ffmpeg -version', { stdio: 'ignore' });
        logger_1.default.info('audio: FFmpeg disponible');
    }
    catch {
        throw new Error('FFmpeg est requis mais introuvable dans le PATH. Installez FFmpeg pour utiliser downloadAudio.');
    }
}
ensureFfmpeg();
/**
 * Télécharge le récité Al-Afasy, normalise à -14 LUFS, écrit `./tmp/audio_{n}.mp3`.
 */
async function downloadAudio(sourateNumber) {
    const tmpDir = node_path_1.default.join(process.cwd(), 'tmp');
    (0, node_fs_1.mkdirSync)(tmpDir, { recursive: true });
    const url = `${CDN_BASE}/${sourateNumber}.mp3`;
    const rawPath = node_path_1.default.join(tmpDir, `audio_${sourateNumber}_raw.mp3`);
    const outPath = node_path_1.default.join(tmpDir, `audio_${sourateNumber}.mp3`);
    logger_1.default.info('audio: téléchargement', { sourateNumber, url });
    const res = await axios_1.default.get(url, {
        responseType: 'arraybuffer',
        timeout: 120_000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });
    (0, node_fs_1.writeFileSync)(rawPath, Buffer.from(res.data));
    logger_1.default.info('audio: normalisation loudnorm -14 LUFS', { sourateNumber, outPath });
    (0, node_child_process_1.execFileSync)('ffmpeg', ['-y', '-i', rawPath, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', outPath], { stdio: 'inherit' });
    try {
        (0, node_fs_1.unlinkSync)(rawPath);
    }
    catch {
        /* ignore */
    }
    logger_1.default.info('audio: fichier prêt', { outPath });
    return outPath;
}
//# sourceMappingURL=audio.js.map