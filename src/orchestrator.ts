import 'dotenv/config';
import path from 'node:path';
import cron from 'node-cron';
import type { PipelineState } from './types/index';
import { fetchSourateData } from './modules/quran-data';
import { downloadAudio } from './modules/audio';
import { assignTimestamps } from './modules/timestamps';
import { analyzeTheme } from './modules/theme-ai';
import { fetchVisuals } from './modules/visuals';
import { renderVideo } from './modules/renderer';
import { generateMetadata } from './modules/metadata';
import { publishEverywhere } from './modules/publisher';
import { fetchVideoStats } from './modules/analytics';
import logger from './utils/logger';
import { sendAlert } from './utils/telegram';

const STATE_FILE = path.join(process.cwd(), 'pipeline-state.json');
const MAX_RETRIES = 3;

function loadState(): PipelineState {
  try {
    const { readFileSync } = require('node:fs');
    const raw = readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw) as PipelineState;
  } catch {
    return {
      current_sourate: 1,
      status: 'idle',
      last_published_at: null,
      total_published: 0,
      retry_count: 0,
      last_error: null,
    };
  }
}

function saveState(state: PipelineState): void {
  const { writeFileSync } = require('node:fs');
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

let state: PipelineState = loadState();

export function getPipelineState(): PipelineState {
  return { ...state };
}

export async function runPipeline(sourateNumber: number): Promise<void> {
  if (state.status === 'running') {
    logger.warn('orchestrator: pipeline déjà en cours, skip');
    return;
  }

  if (sourateNumber > 114) {
    logger.info('orchestrator: toutes les sourates publiées ! 🎉');
    await sendAlert('🎉 quran-agent : toutes les 114 sourates ont été publiées !');
    return;
  }

  state = { ...state, current_sourate: sourateNumber, status: 'running', last_error: null };
  saveState(state);

  try {
    logger.info('orchestrator: démarrage pipeline', { sourateNumber });

    const { sourate, verses } = await fetchSourateData(sourateNumber);
    const audioPath = await downloadAudio(sourateNumber);
    const timed = await assignTimestamps(verses, audioPath);
    const theme = await analyzeTheme(sourate, timed);
    const imagePaths = await fetchVisuals(theme, sourateNumber);

    const outDir = path.join(process.cwd(), 'output');
    let lastRenderLogPct = -1;
    const { shortPath, longPath } = await renderVideo(
      {
        sourateNumber,
        audioPath,
        imagePaths,
        verses: timed,
        outputDir: outDir,
      },
      (p) => {
        if (p.globalPct - lastRenderLogPct >= 4 || p.globalPct >= 99.5 || p.phase === 'terminé') {
          lastRenderLogPct = p.globalPct;
          logger.info('orchestrator: rendu vidéo', {
            phase: p.phase,
            pctGlobal: Number(p.globalPct.toFixed(1)),
            pctPasse: Number(p.passPct.toFixed(1)),
            etaSecRestant:
              p.etaSec !== undefined && Number.isFinite(p.etaSec) ? Math.round(p.etaSec) : undefined,
          });
        }
      },
    );

    const metadata = await generateMetadata(sourate);

    const published = await publishEverywhere({
      shortPath,
      longPath,
      metadata,
      sourateNumber,
    });

    logger.info('orchestrator: vidéos publiées', {
      youtubeLongId: published.youtubeLongId,
      youtubeShortId: published.youtubeShortId,
    });

    // Analytics J+0
    setTimeout(async () => {
      try {
        const stats = await fetchVideoStats({
          youtubeLongId: published.youtubeLongId,
          youtubeShortId: published.youtubeShortId,
        });
        logger.info('orchestrator: stats initiales', { stats });
      } catch (err) {
        logger.warn('orchestrator: stats échouées', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, 30_000);

    state = {
      current_sourate: sourateNumber + 1,
      status: 'idle',
      last_published_at: new Date().toISOString(),
      total_published: state.total_published + 1,
      retry_count: 0,
      last_error: null,
    };
    saveState(state);

    logger.info('orchestrator: pipeline terminé ✅', {
      sourateNumber,
      next: sourateNumber + 1,
      total: state.total_published,
    });

    await sendAlert(`✅ Sourate ${sourateNumber} publiée — ${sourate.name_fr} | YouTube: ${published.youtubeLongId}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    state = {
      ...state,
      status: 'error',
      last_error: msg,
      retry_count: state.retry_count + 1,
    };
    saveState(state);

    logger.error('orchestrator: erreur pipeline', { sourateNumber, error: msg });

    if (state.retry_count >= MAX_RETRIES) {
      logger.error('orchestrator: max retries atteint, passage à la sourate suivante');
      state = { ...state, current_sourate: sourateNumber + 1, retry_count: 0, status: 'idle' };
      saveState(state);
      await sendAlert(`🚨 quran-agent : sourate ${sourateNumber} échouée après ${MAX_RETRIES} tentatives. Passage à la suivante.`);
    } else {
      await sendAlert(`⚠️ quran-agent erreur (sourate ${sourateNumber}, tentative ${state.retry_count}/${MAX_RETRIES}): ${msg}`);
    }
  }
}

async function main(): Promise<void> {
  // Mode manuel : npx tsx src/orchestrator.ts 5
  const arg = process.argv[2];

  if (arg && !isNaN(Number(arg))) {
    const n = Number(arg);
    if (n >= 1 && n <= 114) {
      await runPipeline(n);
      return;
    }
  }

  // Mode automatique avec cron
  logger.info('orchestrator: démarrage mode automatique 🤖', {
    current_sourate: state.current_sourate,
    total_published: state.total_published,
  });

  // Publication tous les jours à 7h00 et 19h00
  cron.schedule('0 7,19 * * *', async () => {
    logger.info('orchestrator: cron déclenché', {
      sourate: state.current_sourate,
      heure: new Date().toISOString(),
    });
    await runPipeline(state.current_sourate);
  }, {
    timezone: 'Europe/Paris',
  });

  logger.info('orchestrator: cron actif — publication à 7h00 et 19h00 (Paris) ✅');
  logger.info('orchestrator: prochaine sourate', { sourate: state.current_sourate });

  // Garde le process actif
  process.on('SIGINT', () => {
    logger.info('orchestrator: arrêt propre');
    process.exit(0);
  });
}

void main();