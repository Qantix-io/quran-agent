"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVisualPrompt = buildVisualPrompt;
const logger_1 = __importDefault(require("../utils/logger"));
/** Construit un prompt broll / image à partir du thème. */
function buildVisualPrompt(theme, verseHint) {
    const base = `${theme.keywords.join(', ')}. Mood: ${theme.mood}. Colors: ${theme.color_palette}.`;
    const prompt = verseHint ? `${base} Context: ${verseHint}` : base;
    logger_1.default.debug('visuals: prompt généré', { category: theme.category });
    return { prompt };
}
//# sourceMappingURL=visuals.js.map