import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Verse } from '../types/index';
import logger from '../utils/logger';

/** Génère un SRT minimal à partir des versets horodatés. */
export function writeSrt(verses: Verse[], outPath: string): string {
  mkdirSync(path.dirname(outPath), { recursive: true });
  const lines: string[] = [];
  let idx = 1;
  for (const v of verses) {
    if (v.timestamp_start == null || v.timestamp_end == null) continue;
    lines.push(String(idx++));
    lines.push(`${formatSrtTime(v.timestamp_start)} --> ${formatSrtTime(v.timestamp_end)}`);
    lines.push(`${v.text_ar}\n${v.translation_fr}`);
    lines.push('');
  }
  const body = lines.join('\n');
  writeFileSync(outPath, body, 'utf8');
  logger.info('subtitles: SRT écrit', { outPath, cues: idx - 1 });
  return outPath;
}

function formatSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}
