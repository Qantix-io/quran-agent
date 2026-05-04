import { mkdirSync, unlinkSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { Verse } from '../types/index';
import logger from '../utils/logger';

export interface RenderJob {
  sourateNumber: number;
  audioPath: string;
  imagePaths: string[];
  verses: Verse[];
  outputDir: string;
}

export interface RenderResult {
  shortPath: string;
  longPath: string;
}

export interface EncodeProfile {
  preset: string;
  crf: string;
  audioBitrate: string;
  maxrate?: string;
  bufsize?: string;
}

export interface RenderProgress {
  phase: string;
  globalPct: number;
  passPct: number;
  etaSec?: number;
}

export function getEncodeProfile(durationSec: number): EncodeProfile {
  if (durationSec >= 90 * 60) {
    return { preset: 'ultrafast', crf: '28', audioBitrate: '96k', maxrate: '1.5M', bufsize: '3M' };
  }
  if (durationSec >= 30 * 60) {
    return { preset: 'faster', crf: '26', audioBitrate: '128k', maxrate: '2.5M', bufsize: '5M' };
  }
  return { preset: 'fast', crf: '23', audioBitrate: '192k' };
}

function appendX264RateArgs(args: string[], enc: EncodeProfile): void {
  args.push('-c:v', 'libx264', '-preset', enc.preset, '-crf', enc.crf);
  if (enc.maxrate && enc.bufsize) {
    args.push('-maxrate', enc.maxrate, '-bufsize', enc.bufsize);
  }
}

function runFfmpegWithProgress(
  bin: string,
  baseArgs: string[],
  opts: { cwd?: string; durationSec: number; onProgress?: (passPct: number) => void },
): Promise<void> {
  const { cwd, durationSec, onProgress } = opts;
  const args = ['-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', ...baseArgs];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    const state: Record<string, string> = {};
    let lastEmit = 0;
    let lastPct = -1;

    const emitFromState = (): void => {
      if (!onProgress || durationSec <= 0) return;
      let outSec = 0;
      if (state.out_time_us !== undefined) {
        const us = Number(state.out_time_us);
        if (Number.isFinite(us)) outSec = us / 1e6;
      } else if (state.out_time_ms !== undefined) {
        const v = Number(state.out_time_ms);
        if (Number.isFinite(v)) outSec = v / 1e6;
      }
      if (outSec <= 0) return;
      outSec = Math.min(outSec, durationSec * 1.25);
      const passPct = Math.min(99.9, (outSec / durationSec) * 100);
      const now = Date.now();
      if (now - lastEmit > 2000 || passPct - lastPct >= 2 || passPct >= 99) {
        lastEmit = now;
        lastPct = passPct;
        onProgress(passPct);
      }
    };

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
      rl.on('line', (line) => {
        const eq = line.indexOf('=');
        if (eq <= 0) return;
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        state[k] = v;
        if (k === 'progress' && (v === 'continue' || v === 'end')) emitFromState();
      });
    }

    let errBuf = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      errBuf += chunk;
      if (errBuf.length > 32_000) errBuf = errBuf.slice(-32_000);
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const tail = errBuf.trim().split('\n').slice(-5).join('\n');
        reject(new Error(`FFmpeg passe1 échoué (code ${code})${tail ? ` — ${tail}` : ''}`));
      }
    });
  });
}

const FPS = 30;

function toAssTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\N')
    .replace(/,/g, '\\,')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/<[^>]+>/g, '');
}

export function generateAssSubtitles(
  verses: Verse[],
  duration: number,
  width: number,
  height: number,
): string {
  const lines: string[] = [];

  // Calcul des marges en pixels selon la résolution
  // Arabe en haut : MarginV = 10% de la hauteur
  const marginArabe = Math.round(height * 0.10);
  // Français en bas : MarginV = 22% de la hauteur (remonté depuis le bas)
  const marginFrancais = Math.round(height * 0.22);

  lines.push('[Script Info]');
  lines.push('Title: quran-agent');
  lines.push('ScriptType: v4.00+');
  lines.push('WrapStyle: 0');
  lines.push('ScaledBorderAndShadow: yes');
  lines.push(`PlayResX: ${width}`);
  lines.push(`PlayResY: ${height}`);
  lines.push('');
  lines.push('[V4+ Styles]');
  lines.push(
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  );
  // Arabe : Alignment 8 = top-center, MarginV depuis le haut
  lines.push(
    `Style: Arabic,Arial Unicode MS,56,&H0037AFD4,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,2,2,8,40,40,${marginArabe},1`,
  );
  // Français : Alignment 2 = bottom-center, MarginV depuis le bas
  lines.push(
    `Style: French,Arial,36,&H00FFFF88,&H000000FF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,50,50,${marginFrancais},1`,
  );
  lines.push('');
  lines.push('[Events]');
  lines.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

  const n = Math.max(verses.length, 1);
  const slice = duration / n;

  verses.forEach((v, i) => {
    const startSec = v.timestamp_start ?? i * slice;
    const endSec = v.timestamp_end ?? (i + 1) * slice;
    const start = toAssTime(Math.max(0, startSec));
    const end = toAssTime(Math.max(startSec + 0.01, endSec));
    const ar = escapeAssText(v.text_ar || '');
    const fr = escapeAssText((v.translation_fr || '').slice(0, 200));

    if (ar) lines.push(`Dialogue: 0,${start},${end},Arabic,,0,0,0,,{\\an8\\fs56}${ar}`);
    if (fr) lines.push(`Dialogue: 0,${start},${end},French,,0,0,0,,{\\an2\\fs36}${fr}`);
  });

  return lines.join('\n') + '\n';
}

function getAudioDurationSec(audioPath: string): number {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath],
    { encoding: 'utf8' },
  );
  if (r.status !== 0 || !r.stdout) {
    logger.warn('renderer: ffprobe durée échouée');
    return 0;
  }
  const d = parseFloat(String(r.stdout).trim());
  return Number.isFinite(d) && d > 0 ? d : 0;
}

function prepareAssForBurn(assAbsolutePath: string, tag: string): {
  burnDir: string;
  burnName: string;
  burnPath: string;
} {
  const burnDir = path.join(process.cwd(), 'tmp');
  mkdirSync(burnDir, { recursive: true });
  const burnName = `assburn_${tag.replace(/[^a-zA-Z0-9_-]+/g, '_')}.ass`;
  const burnPath = path.join(burnDir, burnName);
  copyFileSync(assAbsolutePath, burnPath);
  logger.info('renderer: ASS copié pour brûlage', { burnPath });
  return { burnDir, burnName, burnPath };
}

function ffmpegListsSubtitlesFilter(ffmpegBin: string): boolean {
  const r = spawnSync(ffmpegBin, ['-hide_banner', '-filters'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  return /\bass\s+V->V/.test(out) || /\bsubtitles\s+V->V/.test(out);
}

function resolveBurnFfmpegBin(): string {
  try {
    const p = require('ffmpeg-static') as string | undefined;
    if (p && existsSync(p) && ffmpegListsSubtitlesFilter(p)) {
      logger.info('renderer: passe2 — ffmpeg-static (libass)', { path: p });
      return p;
    }
  } catch { /* pas installé */ }
  if (ffmpegListsSubtitlesFilter('ffmpeg')) {
    logger.info('renderer: passe2 — ffmpeg système avec libass');
    return 'ffmpeg';
  }
  throw new Error('Brûlage ASS impossible : installez `ffmpeg-static` via npm.');
}

function emitRenderProgress(
  on: ((p: RenderProgress) => void) | undefined,
  phase: string,
  quarterIndex: number,
  passPct: number,
  renderStartedAt: number,
): void {
  if (!on) return;
  const globalPct = Math.min(100, quarterIndex * 25 + passPct * 0.25);
  const elapsed = (Date.now() - renderStartedAt) / 1000;
  let etaSec: number | undefined;
  if (globalPct > 0.5) {
    etaSec = Math.max(0, (elapsed / (globalPct / 100)) - elapsed);
  }
  on({ phase, globalPct, passPct, etaSec });
}

export interface RenderFormatOptions {
  formatLabel: 'short' | 'long';
  encode: EncodeProfile;
  durationSec: number;
  renderStartedAt: number;
  onRenderProgress?: (p: RenderProgress) => void;
}

export async function renderFormat(
  job: RenderJob,
  width: number,
  height: number,
  outputPath: string,
  assPath: string,
  opts: RenderFormatOptions,
): Promise<string> {
  const { encode, durationSec, renderStartedAt, onRenderProgress, formatLabel } = opts;
  const { audioPath, imagePaths } = job;
  const imgs = [...imagePaths];
  while (imgs.length < 3) imgs.push(imgs[imgs.length - 1] ?? imgs[0]);
  const three = imgs.slice(0, 3);

  mkdirSync(path.dirname(outputPath), { recursive: true });
  mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });

  const tag = `${job.sourateNumber}_${width}x${height}`;
  const tempNoSubs = path.join(process.cwd(), 'tmp', `nosubs_${tag}.mp4`);

  const duration = durationSec > 0 ? durationSec : getAudioDurationSec(audioPath) || Math.max(three.length * 2, 10);
  const seg = duration / three.length;
  const segFrames = Math.max(1, Math.round(seg * FPS));
  const zFrames = segFrames * 4;
  const zStep = (0.04 / zFrames).toFixed(7);

  const fcParts: string[] = [];
  const concatInputs: string[] = [];

  three.forEach((_, i) => {
    const inIdx = i + 1;
    const scaled = `sc${i}`;
    const kb = `kb${i}`;
    const part = `pt${i}`;

    fcParts.push(
      `[${inIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=yuv420p,fps=${FPS}[${scaled}]`,
    );
    fcParts.push(
      `[${scaled}]zoompan=z='min(zoom+${zStep}\\,1.04)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${zFrames}:s=${width}x${height}:fps=${FPS}[${kb}]`,
    );
    fcParts.push(
      `[${kb}]trim=duration=${seg.toFixed(4)},setpts=PTS-STARTPTS[${part}]`,
    );
    concatInputs.push(`[${part}]`);
  });

  fcParts.push(`${concatInputs.join('')}concat=n=${three.length}:v=1:a=0[vcat]`);

  const pass1Args: string[] = [
    '-y',
    '-i', audioPath,
    ...three.flatMap((p) => ['-loop', '1', '-i', p]),
    '-filter_complex', fcParts.join(';'),
    '-map', '[vcat]',
    '-map', '0:a',
  ];
  appendX264RateArgs(pass1Args, encode);
  pass1Args.push(
    '-c:a', 'aac',
    '-b:a', encode.audioBitrate,
    '-shortest',
    '-movflags', '+faststart',
    tempNoSubs,
  );

  const qPass1 = formatLabel === 'short' ? 0 : 2;
  logger.info('renderer: passe1 (sans sous-titres)', { outputPath, preset: encode.preset, crf: encode.crf });
  try {
    await runFfmpegWithProgress('ffmpeg', pass1Args, {
      durationSec: duration,
      onProgress: (passPct) => {
        emitRenderProgress(onRenderProgress, `${formatLabel}:passe1`, qPass1, passPct, renderStartedAt);
      },
    });
  } catch (e) {
    try { if (existsSync(tempNoSubs)) unlinkSync(tempNoSubs); } catch { /* ignore */ }
    throw e;
  }

  const { burnDir, burnName, burnPath } = prepareAssForBurn(assPath, tag);
  const burnBin = resolveBurnFfmpegBin();

  const pass2Args: string[] = [
    '-y',
    '-i', tempNoSubs,
    '-vf', `ass=${burnName}`,
  ];
  appendX264RateArgs(pass2Args, encode);
  pass2Args.push('-c:a', 'copy', '-movflags', '+faststart', outputPath);

  const qPass2 = formatLabel === 'short' ? 1 : 3;
  logger.info('renderer: passe2 (brûlage sous-titres)', { burnBin, outputPath, preset: encode.preset });
  try {
    await runFfmpegWithProgress(burnBin, pass2Args, {
      cwd: burnDir,
      durationSec: duration,
      onProgress: (passPct) => {
        emitRenderProgress(onRenderProgress, `${formatLabel}:passe2`, qPass2, passPct, renderStartedAt);
      },
    });
  } catch (e) {
    try { if (existsSync(burnPath)) unlinkSync(burnPath); } catch { /* ignore */ }
    try { if (existsSync(tempNoSubs)) unlinkSync(tempNoSubs); } catch { /* ignore */ }
    throw e;
  }

  try { if (existsSync(burnPath)) unlinkSync(burnPath); } catch { /* ignore */ }
  try { if (existsSync(tempNoSubs)) unlinkSync(tempNoSubs); } catch { /* ignore */ }
  if (!existsSync(outputPath)) throw new Error(`Sortie absente: ${outputPath}`);

  logger.info('renderer: rendu terminé', { outputPath });
  return outputPath;
}

export async function renderVideo(
  job: RenderJob,
  onProgress?: (p: RenderProgress) => void,
): Promise<RenderResult> {
  const { sourateNumber, verses, outputDir } = job;
  mkdirSync(outputDir, { recursive: true });

  const duration =
    getAudioDurationSec(job.audioPath) ||
    (verses.length > 0
      ? Math.max(...verses.map((v) => v.timestamp_end ?? 0), 0) || verses.length * 4
      : 30);

  const encode = getEncodeProfile(duration);
  const renderStartedAt = Date.now();

  logger.info('renderer: durée utilisée', {
    duration,
    sourateNumber,
    preset: encode.preset,
    crf: encode.crf,
    audioBitrate: encode.audioBitrate,
  });

  const assShort = path.join(outputDir, `subtitles_${sourateNumber}_short.ass`);
  const assLong = path.join(outputDir, `subtitles_${sourateNumber}_long.ass`);
  writeFileSync(assShort, generateAssSubtitles(verses, duration, 1080, 1920), 'utf8');
  writeFileSync(assLong, generateAssSubtitles(verses, duration, 1920, 1080), 'utf8');

  const shortPath = path.join(outputDir, `sourate_${sourateNumber}_short.mp4`);
  const longPath = path.join(outputDir, `sourate_${sourateNumber}_long.mp4`);

  const formatOptsBase = {
    encode,
    durationSec: duration,
    renderStartedAt,
    onRenderProgress: onProgress,
  };

  await renderFormat(job, 1080, 1920, shortPath, assShort, { ...formatOptsBase, formatLabel: 'short' });
  await renderFormat(job, 1920, 1080, longPath, assLong, { ...formatOptsBase, formatLabel: 'long' });

  onProgress?.({ phase: 'terminé', globalPct: 100, passPct: 100, etaSec: 0 });

  return { shortPath, longPath };
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(process.cwd(), '.env') });
  const { fetchSourateData } = require('./quran-data') as typeof import('./quran-data');
  const { downloadAudio } = require('./audio') as typeof import('./audio');
  const { assignTimestamps } = require('./timestamps') as typeof import('./timestamps');
  const { analyzeTheme } = require('./theme-ai') as typeof import('./theme-ai');
  const { fetchVisuals } = require('./visuals') as typeof import('./visuals');

  void (async () => {
    logger.info('renderer:test — Al-Fatiha zoom doux centré');
    const { sourate, verses } = await fetchSourateData(1);
    const audioPath = await downloadAudio(1);
    const timedVerses = await assignTimestamps(verses, audioPath);
    const theme = await analyzeTheme(sourate, timedVerses);
    const imagePaths = await fetchVisuals(theme, 1);

    const result = await renderVideo(
      {
        sourateNumber: 1,
        audioPath,
        imagePaths,
        verses: timedVerses,
        outputDir: path.join(process.cwd(), 'output'),
      },
      (p) => logger.info('renderer:test progression', p),
    );

    console.log('✅ Short (9:16):', result.shortPath);
    console.log('✅ Long (16:9):', result.longPath);
  })().catch((err) => {
    logger.error('renderer:test — échec', { err: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  });
}