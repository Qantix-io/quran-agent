import 'dotenv/config';
import path from 'node:path';
import type { PipelineState } from './types/index';
import { fetchSourateData } from './modules/quran-data';
import { downloadAudio } from './modules/audio';
import { assignTimestamps } from './modules/timestamps';
import { analyzeTheme } from './modules/theme-ai';
import { fetchVisuals } from './modules/visuals';
import { renderVideo } from './modules/renderer';
import { generateThumbnail } from './modules/thumbnails';
import { generateMetadata } from './modules/metadata';
import { publishEverywhere } from './modules/publisher';
import { fetchVideoStats } from './modules/analytics';
import logger from './utils/logger';
import { sendAlert } from './utils/telegram';

let state: PipelineState = {
  current_sourate: 1,
  status: 'idle',
  last_published_at: null,
  total_published: 0,
  retry_count: 0,
  last_error: null,
};

export function getPipelineState(): PipelineState {
  return { ...state };
}

export async function runPipeline(sourateNumber: number): Promise<void> {
  state = {
    ...state,
    current_sourate: sourateNumber,
    status: 'running',
    last_error: null,
    retry_count: 0,
  };

  try {
    logger.info('orchestrator: démarrage pipeline', { sourateNumber });

    const { sourate, verses } = await fetchSourateData(sourateNumber);
    const audioPath = await downloadAudio(sourateNumber);
    const timed = await assignTimestamps(verses, audioPath);
    const theme = await analyzeTheme(sourate, timed);
    const imagePaths = await fetchVisuals(theme, sourateNumber);

    const outDir = path.join(process.cwd(), 'output');
    const { shortPath, longPath } = await renderVideo({
      sourateNumber,
      audioPath,
      imagePaths,
      verses: timed,
      outputDir: outDir,
    });

    const thumbPath = path.join(outDir, `sourate_${sourateNumber}_thumb.jpg`);
    await generateThumbnail({ outPath: thumbPath, title: sourate.name_fr });

    const metadata = await generateMetadata(sourate);
    await publishEverywhere({
      shortPath,
      longPath,
      metadata,
      sourateNumber,
    });
    await fetchVideoStats({ youtube: longPath });

    state = {
      ...state,
      status: 'idle',
      last_published_at: new Date().toISOString(),
      total_published: state.total_published + 1,
      last_error: null,
    };
    logger.info('orchestrator: pipeline terminé', { sourateNumber, shortPath, longPath });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state = {
      ...state,
      status: 'error',
      last_error: msg,
      retry_count: state.retry_count + 1,
    };
    logger.error('orchestrator: erreur pipeline', { sourateNumber, error: msg });
    await sendAlert(`quran-agent erreur (sourate ${sourateNumber}): ${msg}`);
    throw err;
  }
}

async function main(): Promise<void> {
  const n = Number(process.argv[2] ?? '1');
  if (!Number.isFinite(n) || n < 1 || n > 114) {
    logger.error('Usage: npm run dev -- <sourate 1-114>');
    process.exitCode = 1;
    return;
  }
  await runPipeline(n);
}

void main();
