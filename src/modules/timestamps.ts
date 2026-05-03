import { execSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import OpenAI from 'openai';
import type { Verse } from '../types/index';
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

export async function assignTimestamps(
  verses: Verse[],
  audioPath: string,
): Promise<Verse[]> {
  logger.info('timestamps: début Whisper', { audioPath, verses: verses.length });

  const duration = getAudioDuration(audioPath);
  const total = duration > 0 ? duration : verses.length * 4;

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
      logger.warn('timestamps: pas de segments Whisper, fallback linéaire');
      return assignLinearFallback(verses, total);
    }

    logger.info('timestamps: segments Whisper reçus', { count: segments.length });

    const segPerVerse = Math.max(1, Math.floor(segments.length / verses.length));
    return verses.map((v, i) => {
      const startSeg = i * segPerVerse;
      const endSeg = i === verses.length - 1
        ? segments.length - 1
        : Math.min((i + 1) * segPerVerse - 1, segments.length - 1);
      return {
        ...v,
        timestamp_start: parseFloat((segments[startSeg]?.start ?? 0).toFixed(3)),
        timestamp_end: parseFloat((segments[endSeg]?.end ?? 0).toFixed(3)),
      };
    });
  } catch (err) {
    logger.warn('timestamps: Whisper échoué, fallback linéaire', {
      error: err instanceof Error ? err.message : String(err),
    });
    return assignLinearFallback(verses, total);
  }
}

// Test direct : npx tsx src/modules/timestamps.ts
if (require.main === module) {
  import('dotenv').then(({ config }) => {
    config();
    const { fetchSourateData } = require('./quran-data');
    const { downloadAudio } = require('./audio');

    (async () => {
      const { verses } = await fetchSourateData(1);
      const audioPath = await downloadAudio(1);
      const result = await assignTimestamps(verses, audioPath);
      result.forEach(v => {
        console.log(`Verset ${v.number}: ${v.timestamp_start}s → ${v.timestamp_end}s`);
        console.log(`  AR: ${v.text_ar.substring(0, 50)}`);
      });
    })().catch(console.error);
  });
}