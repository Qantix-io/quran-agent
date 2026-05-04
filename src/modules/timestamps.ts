import { execSync } from 'node:child_process';
import { createReadStream, statSync } from 'node:fs';
import OpenAI from 'openai';
import type { Verse } from '../types/index';
import { WHISPER_MAX_FILE_BYTES } from './audio';
import logger from '../utils/logger';

function getClient(): OpenAI {
  const key = require('fs').readFileSync('.env', 'utf8')
    .match(/QURAN_OPENAI_KEY=(.+)/)?.[1]?.trim();
  if (!key) throw new Error('QURAN_OPENAI_KEY manquante dans .env');
  return new OpenAI({ apiKey: key });
}

function getAudioDuration(audioPath: string): number {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`,
    ).toString().trim();
    const duration = parseFloat(output);
    return isNaN(duration) ? 0 : duration;
  } catch {
    logger.warn('timestamps: ffprobe échoué, durée estimée');
    return 0;
  }
}

function assignLinearFallback(verses: Verse[], durationSec: number): Verse[] {
  const slice = durationSec / verses.length;
  logger.info('timestamps: fallback linéaire', { verses: verses.length, durationSec });
  return verses.map((v, i) => ({
    ...v,
    timestamp_start: parseFloat((i * slice).toFixed(3)),
    timestamp_end: parseFloat(((i + 1) * slice).toFixed(3)),
  }));
}

/** Répartition proportionnelle à la longueur du texte arabe de chaque verset. */
function assignProportionalFallback(verses: Verse[], durationSec: number): Verse[] {
  const weights = verses.map((v) => Math.max(8, (v.text_ar || '').length));
  const sum = weights.reduce((a, b) => a + b, 0);
  logger.info('timestamps: fallback proportionnel (longueur texte ar)', {
    verses: verses.length,
    durationSec,
    sumWeights: sum,
  });

  let t = 0;
  return verses.map((v, i) => {
    const w = weights[i]!;
    const seg = (durationSec * w) / sum;
    const start = t;
    t += seg;
    const end = i === verses.length - 1 ? durationSec : t;
    return {
      ...v,
      timestamp_start: parseFloat(start.toFixed(3)),
      timestamp_end: parseFloat(end.toFixed(3)),
    };
  });
}

export async function assignTimestamps(
  verses: Verse[],
  audioPath: string,
): Promise<Verse[]> {
  const duration = getAudioDuration(audioPath);
  const total = duration > 0 ? duration : verses.length * 4;

  let size = 0;
  try {
    size = statSync(audioPath).size;
  } catch {
    logger.warn('timestamps: impossible de lire la taille du fichier audio');
  }

  if (size >= WHISPER_MAX_FILE_BYTES) {
    logger.warn('timestamps: fichier audio ≥ limite Whisper — pas d’appel API', {
      audioPath,
      sizeBytes: size,
      limitBytes: WHISPER_MAX_FILE_BYTES,
      durationSec: total,
    });
    return assignProportionalFallback(verses, total);
  }

  logger.info('timestamps: début Whisper', {
    audioPath,
    verses: verses.length,
    sizeMb: (size / (1024 * 1024)).toFixed(2),
  });

  try {
    const client = getClient();
    const transcription = await client.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      language: 'ar',
    });

    const segments = (transcription as any).segments as Array<{
      start: number;
      end: number;
      text: string;
    }>;

    if (!segments || segments.length === 0) {
      logger.warn('timestamps: pas de segments Whisper, fallback proportionnel');
      return assignProportionalFallback(verses, total);
    }

    logger.info('timestamps: segments Whisper reçus', { count: segments.length });

    const segPerVerse = Math.max(1, Math.floor(segments.length / verses.length));
    return verses.map((v, i) => {
      const startSeg = i * segPerVerse;
      const endSeg =
        i === verses.length - 1
          ? segments.length - 1
          : Math.min((i + 1) * segPerVerse - 1, segments.length - 1);
      return {
        ...v,
        timestamp_start: parseFloat((segments[startSeg]?.start ?? 0).toFixed(3)),
        timestamp_end: parseFloat((segments[endSeg]?.end ?? 0).toFixed(3)),
      };
    });
  } catch (err) {
    logger.warn('timestamps: Whisper échoué, fallback proportionnel', {
      error: err instanceof Error ? err.message : String(err),
    });
    return assignProportionalFallback(verses, total);
  }
}

if (require.main === module) {
  import('dotenv').then(({ config }) => {
    config();
    const { fetchSourateData } = require('./quran-data');
    const { downloadAudio } = require('./audio');

    void (async () => {
      const { verses } = await fetchSourateData(1);
      const audioPath = await downloadAudio(1);
      const result = await assignTimestamps(verses, audioPath);
      for (const v of result) {
        console.log(`Verset ${v.number}: ${v.timestamp_start}s → ${v.timestamp_end}s`);
        console.log(`  AR: ${v.text_ar.substring(0, 50)}`);
      }
    })().catch(console.error);
  });
}
