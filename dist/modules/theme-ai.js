"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveVisualTheme = resolveVisualTheme;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const logger_1 = __importDefault(require("../utils/logger"));
function loadThemes() {
    const p = (0, node_path_1.join)(process.cwd(), 'src/config/themes.json');
    const raw = (0, node_fs_1.readFileSync)(p, 'utf8');
    return JSON.parse(raw);
}
/** Résout le thème visuel à partir de la catégorie métier (clé themes.json). */
function resolveVisualTheme(themeCategory) {
    const themes = loadThemes();
    const key = themeCategory in themes ? themeCategory : 'tawhid';
    const t = themes[key];
    logger_1.default.info('theme-ai: thème résolu', { themeCategory, key });
    return {
        category: key,
        keywords: t.keywords,
        mood: t.mood,
        color_palette: t.color_palette,
    };
}
//# sourceMappingURL=theme-ai.js.map