"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeSrt = writeSrt;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const logger_1 = __importDefault(require("../utils/logger"));
/** Génère un SRT minimal à partir des versets horodatés. */
function writeSrt(verses, outPath) {
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(outPath), { recursive: true });
    const lines = [];
    let idx = 1;
    for (const v of verses) {
        if (v.timestamp_start == null || v.timestamp_end == null)
            continue;
        lines.push(String(idx++));
        lines.push(`${formatSrtTime(v.timestamp_start)} --> ${formatSrtTime(v.timestamp_end)}`);
        lines.push(`${v.text_ar}\n${v.translation_fr}`);
        lines.push('');
    }
    const body = lines.join('\n');
    (0, node_fs_1.writeFileSync)(outPath, body, 'utf8');
    logger_1.default.info('subtitles: SRT écrit', { outPath, cues: idx - 1 });
    return outPath;
}
function formatSrtTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}
function pad(n, w = 2) {
    return String(n).padStart(w, '0');
}
//# sourceMappingURL=subtitles.js.map