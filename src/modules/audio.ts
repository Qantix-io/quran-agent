import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import logger from '../utils/logger';

const AUDIO_CDN = 'https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee';

/** Marge sous la limite OpenAI Whisper (~25 Mo). */
export const WHISPER_MAX_FILE_BYTES = 24 * 1024 * 1024;

/** Au-delà : normalisation plus légère que loudnorm intégral (sourates longues). */
const LONG_AUDIO_SEC = 30 * 60;
const LARGE_RAW_BYTES = 45 * 1024 * 1024;

export function isAudioTooLargeForWhisper(filePath: string): boolean {
  try {
    return statSync(filePath).size >= WHISPER_MAX_FILE_BYTES;
  } catch {
    return true;
  }
}

function getDurationSec(filePath: string): number {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
      { encoding: 'utf8' },
    ).trim();
    const d = parseFloat(out);
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0;
  }
}

function ensureFfmpeg(): void {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    logger.info('audio: FFmpeg disponible');
  } catch {
    throw new Error('FFmpeg introuvable dans le PATH.');
  }
}

ensureFfmpeg();

/**
 * Normalise le volume : loudnorm classique pour les fichiers courts ;
 * pour sourates longues / gros fichiers : `loudnorm` en mode linéaire (plus rapide) ou `dynaudnorm` si très long.
 */
function normalizeAudio(rawPath: string, outPath: string, sourateNumber: number): void {
  const rawSize = statSync(rawPath).size;
  const dur = getDurationSec(rawPath);
  let filter: string;
  let mode: string;

  if (dur >= 90 * 60 || rawSize >= 80 * 1024 * 1024) {
    filter = 'dynaudnorm=f=240:g=31';
    mode = 'dynaudnorm (très long)';
  } else if (dur >= LONG_AUDIO_SEC || rawSize >= LARGE_RAW_BYTES) {
    filter = 'loudnorm=I=-14:TP=-1.5:LRA=11:linear=true';
    mode = 'loudnorm+linear (long)';
  } else {
    filter = 'loudnorm=I=-14:TP=-1.5:LRA=11';
    mode = 'loudnorm';
  }

  logger.info('audio: normalisation', {
    sourateNumber,
    mode,
    durationSec: Math.round(dur),
    rawMb: (rawSize / (1024 * 1024)).toFixed(2),
  });

  execFileSync('ffmpeg', ['-y', '-i', rawPath, '-af', filter, outPath], { stdio: 'inherit' });
}

export async function downloadAudio(sourateNumber: number): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp');
  mkdirSync(tmpDir, { recursive: true });

  const paddedNum = String(sourateNumber).padStart(3, '0');
  const url = `${AUDIO_CDN}/${paddedNum}.mp3`;
  const rawPath = path.join(tmpDir, `audio_${sourateNumber}_raw.mp3`);
  const outPath = path.join(tmpDir, `audio_${sourateNumber}.mp3`);

  if (existsSync(outPath)) {
    logger.info('audio: fichier déjà présent', { outPath });
    return outPath;
  }

  logger.info('audio: téléchargement sourate complète', { sourateNumber, url });

  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 600_000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  writeFileSync(rawPath, Buffer.from(res.data));

  const rawMb = statSync(rawPath).size / (1024 * 1024);
  if (rawMb > 23) {
    logger.warn('audio: fichier brut volumineux (Whisper peut être ignoré en aval)', {
      sourateNumber,
      rawMb: rawMb.toFixed(2),
      whisperLimitMb: (WHISPER_MAX_FILE_BYTES / (1024 * 1024)).toFixed(0),
    });
  }

  normalizeAudio(rawPath, outPath, sourateNumber);

  try {
    unlinkSync(rawPath);
  } catch {
    /* ignore */
  }

  const outSize = statSync(outPath).size;
  logger.info('audio: fichier prêt', {
    outPath,
    outMb: (outSize / (1024 * 1024)).toFixed(2),
    skipWhisperRecommended: outSize >= WHISPER_MAX_FILE_BYTES,
  });
  return outPath;
}

if (require.main === module) {
  downloadAudio(1)
    .then((p) => {
      console.log('✅ Audio prêt:', p);
    })
    .catch(console.error);
}
