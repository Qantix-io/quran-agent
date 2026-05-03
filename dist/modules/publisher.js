"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishEverywhere = publishEverywhere;
const logger_1 = __importDefault(require("../utils/logger"));
/** Placeholder : branchement APIs YouTube / TikTok (OAuth, upload resumable, etc.). */
async function publishEverywhere(input) {
    logger_1.default.warn('publisher: stub — aucun upload réel', { videoPath: input.videoPath });
    return {};
}
//# sourceMappingURL=publisher.js.map