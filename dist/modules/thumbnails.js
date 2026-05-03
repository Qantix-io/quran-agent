"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateThumbnail = generateThumbnail;
const logger_1 = __importDefault(require("../utils/logger"));
/** Placeholder : génération image (Sharp / FFmpeg) à brancher plus tard. */
async function generateThumbnail(job) {
    logger_1.default.warn('thumbnails: stub — aucun fichier produit', { outPath: job.outPath });
    return job.outPath;
}
//# sourceMappingURL=thumbnails.js.map