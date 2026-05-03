import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import logger from '../utils/logger';

const CDN_BASE = 'https://cdn.islamic.network/quran/audio/128/ar.alafasy';

function ensureFfmpeg(): void {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    logger.info('audio: FFmpeg disponible');
  } catch {
    throw new Error(
      'FFmpeg est requis mais introuvable dans le PATH. Installez FFmpeg pour utiliser downloadAudio.',
    );
  }
}

ensureFfmpeg();

export async function downloadAudio(sourateNumber: number): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp');
  mkdirSync(tmpDir, { recursive: true });

  const url = `${CDN_BASE}/${sourateNumber}.mp3`;
  const rawPath = path.join(tmpDir, `audio_${sourateNumber}_raw.mp3`);
  const outPath = path.join(tmpDir, `audio_${sourateNumber}.mp3`);

  logger.info('audio: téléchargement', { sourateNumber, url });

  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 120_000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  writeFileSync(rawPath, Buffer.from(res.data));

  logger.info('audio: normalisation loudnorm -14 LUFS', { sourateNumber, outPath });

  execFileSync(
    'ffmpeg',
    ['-y', '-i', rawPath, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', outPath],
    { stdio: 'inherit' },
  );

  try {
    unlinkSync(rawPath);
  } catch {
    /* ignore */
  }

  logger.info('audio: fichier prêt', { outPath });
  return outPath;
}

// Test direct : npx tsx src/modules/audio.ts
if (require.main === module) {
  downloadAudio(1).then(path => {
    console.log('✅ Audio téléchargé et normalisé:', path);
  }).catch(console.error);
}