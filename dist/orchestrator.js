"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPipelineState = getPipelineState;
exports.runPipeline = runPipeline;
require("dotenv/config");
const node_path_1 = __importDefault(require("node:path"));
const quran_data_1 = require("./modules/quran-data");
const audio_1 = require("./modules/audio");
const timestamps_1 = require("./modules/timestamps");
const theme_ai_1 = require("./modules/theme-ai");
const visuals_1 = require("./modules/visuals");
const renderer_1 = require("./modules/renderer");
const subtitles_1 = require("./modules/subtitles");
const thumbnails_1 = require("./modules/thumbnails");
const metadata_1 = require("./modules/metadata");
const publisher_1 = require("./modules/publisher");
const analytics_1 = require("./modules/analytics");
const logger_1 = __importDefault(require("./utils/logger"));
const telegram_1 = require("./utils/telegram");
let state = {
    current_sourate: 1,
    status: 'idle',
    last_published_at: null,
    total_published: 0,
    retry_count: 0,
    last_error: null,
};
function getPipelineState() {
    return { ...state };
}
async function runPipeline(sourateNumber) {
    state = {
        ...state,
        current_sourate: sourateNumber,
        status: 'running',
        last_error: null,
        retry_count: 0,
    };
    try {
        logger_1.default.info('orchestrator: démarrage pipeline', { sourateNumber });
        const { sourate, verses } = await (0, quran_data_1.fetchSourateData)(sourateNumber);
        const audioPath = await (0, audio_1.downloadAudio)(sourateNumber);
        const timed = (0, timestamps_1.assignLinearTimestamps)(verses, { durationSec: verses.length * 4 });
        const theme = (0, theme_ai_1.resolveVisualTheme)(sourate.theme_category);
        (0, visuals_1.buildVisualPrompt)(theme, sourate.name_fr);
        const outDir = node_path_1.default.join(process.cwd(), 'output');
        const videoPath = node_path_1.default.join(outDir, `sourate_${sourateNumber}.mp4`);
        const srtPath = node_path_1.default.join(process.cwd(), 'tmp', `sourate_${sourateNumber}.srt`);
        const thumbPath = node_path_1.default.join(outDir, `sourate_${sourateNumber}_thumb.jpg`);
        (0, subtitles_1.writeSrt)(timed, srtPath);
        await (0, renderer_1.renderVideo)({ audioPath, videoOutPath: videoPath, assets: [] });
        await (0, thumbnails_1.generateThumbnail)({ outPath: thumbPath, title: sourate.name_fr });
        const metadata = (0, metadata_1.buildVideoMetadata)(sourate);
        await (0, publisher_1.publishEverywhere)({ videoPath, thumbnailPath: thumbPath, metadata });
        await (0, analytics_1.fetchVideoStats)({});
        state = {
            ...state,
            status: 'idle',
            last_published_at: new Date().toISOString(),
            total_published: state.total_published + 1,
            last_error: null,
        };
        logger_1.default.info('orchestrator: pipeline terminé', { sourateNumber });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state = {
            ...state,
            status: 'error',
            last_error: msg,
            retry_count: state.retry_count + 1,
        };
        logger_1.default.error('orchestrator: erreur pipeline', { sourateNumber, error: msg });
        await (0, telegram_1.sendAlert)(`quran-agent erreur (sourate ${sourateNumber}): ${msg}`);
        throw err;
    }
}
async function main() {
    const n = Number(process.argv[2] ?? '1');
    if (!Number.isFinite(n) || n < 1 || n > 114) {
        logger_1.default.error('Usage: npm run dev -- <sourate 1-114>');
        process.exitCode = 1;
        return;
    }
    await runPipeline(n);
}
void main();
//# sourceMappingURL=orchestrator.js.map