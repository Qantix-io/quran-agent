"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignLinearTimestamps = assignLinearTimestamps;
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Placeholder : répartition linéaire des timestamps par verset.
 * À remplacer par alignement forced-alignment / Whisper si besoin.
 */
function assignLinearTimestamps(verses, options = {}) {
    const n = verses.length;
    if (n === 0)
        return verses;
    const total = options.durationSec ?? n * 4;
    const slice = total / n;
    logger_1.default.info('timestamps: assignation linéaire', { verses: n, totalSec: total });
    return verses.map((v, i) => ({
        ...v,
        timestamp_start: i * slice,
        timestamp_end: (i + 1) * slice,
    }));
}
//# sourceMappingURL=timestamps.js.map