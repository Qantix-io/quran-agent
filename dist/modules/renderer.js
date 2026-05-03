"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderVideo = renderVideo;
const node_path_1 = __importDefault(require("node:path"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Placeholder : ici FFmpeg composera fond + audio + sous-titres.
 * Retourne le chemin de sortie prévu.
 */
async function renderVideo(job) {
    logger_1.default.warn('renderer: implémentation FFmpeg non branchée — sortie attendue', {
        out: job.videoOutPath,
    });
    return node_path_1.default.resolve(job.videoOutPath);
}
//# sourceMappingURL=renderer.js.map