"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVideoMetadata = buildVideoMetadata;
const logger_1 = __importDefault(require("../utils/logger"));
function buildVideoMetadata(sourate) {
    const n = sourate.number;
    const meta = {
        title_fr: `Sourate ${n} — ${sourate.name_fr}`,
        title_en: `Surah ${n} — ${sourate.name_en}`,
        title_ar: `سورة ${sourate.name_ar}`,
        description_fr: `Récitation complète de la sourate ${n} (${sourate.name_fr}).`,
        description_en: `Full recitation of Surah ${n} (${sourate.name_en}).`,
        tags_fr: ['Coran', 'Quran', sourate.name_fr, sourate.theme_category],
        tags_en: ['Quran', 'Islam', sourate.name_en, sourate.theme_category],
        tags_ar: ['قرآن', sourate.name_ar],
    };
    logger_1.default.info('metadata: métadonnées construites', { sourate: n });
    return meta;
}
//# sourceMappingURL=metadata.js.map