import axios from 'axios';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Sourate, Verse } from '../types/index';
import logger from '../utils/logger';

const QURAN_API = 'https://api.quran.com/api/v4';
const TRANSLATION_FR = 136;
const TRANSLATION_EN_LEGACY = 131;
const TRANSLATION_EN_SAHIH = 20;
const MAX_ATTEMPTS = 3;
const RETRY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadLocalSourate(number: number): Partial<Sourate> | null {
  try {
    const raw = readFileSync(join(process.cwd(), 'src/config/sourates.json'), 'utf8');
    const list = JSON.parse(raw) as Sourate[];
    return list.find((s) => s.number === number) ?? null;
  } catch {
    return null;
  }
}

function revelationFromPlace(place: string | undefined): 'Meccan' | 'Medinan' {
  const p = (place ?? '').toLowerCase();
  if (p.includes('madin')) return 'Medinan';
  return 'Meccan';
}

interface ChapterPayload {
  chapter?: {
    id?: number;
    name_arabic?: string;
    translated_name?: { name?: string };
    name_simple?: string;
    verses_count?: number;
    revelation_place?: string;
  };
}

interface VersePayload {
  verse_number?: number;
  text_uthmani?: string;
  translations?: Array<{ resource_id?: number; text?: string }>;
}

interface VersesResponse {
  verses?: VersePayload[];
  pagination?: { next_page?: number | null };
}

function translationText(
  translations: VersePayload['translations'],
  resourceId: number,
): string {
  if (!Array.isArray(translations)) return '';
  const hit = translations.find((t) => t.resource_id === resourceId);
  return stripFootnotes((hit?.text ?? '').trim());
}

function stripFootnotes(html: string): string {
  return html.replace(/<sup[^>]*>.*?<\/sup>/gi, '').replace(/<[^>]+>/g, '').trim();
}

async function fetchChapter(number: number): Promise<Sourate> {
  const url = `${QURAN_API}/chapters/${number}?language=fr`;
  logger.info('quran-data: requête métadonnées sourate', { number, url });
  const { data } = await axios.get<ChapterPayload>(url, { timeout: 30_000 });
  const ch = data.chapter;
  if (!ch?.id) throw new Error('Réponse chapitre invalide');

  const local = loadLocalSourate(number);
  const name_fr = ch.translated_name?.name?.trim() || local?.name_fr || ch.name_simple || '';
  const name_en = ch.name_simple?.trim() || local?.name_en || '';
  const name_ar = ch.name_arabic?.trim() || local?.name_ar || '';
  const verses_count = ch.verses_count ?? local?.verses_count ?? 0;
  const revelation_type = revelationFromPlace(ch.revelation_place);
  const theme_category = local?.theme_category ?? 'tawhid';

  return { number: ch.id, name_ar, name_fr, name_en, verses_count, revelation_type, theme_category };
}

async function fetchVersePages(
  number: number,
  translationIds: string,
  logLabel: string,
): Promise<Map<number, VersePayload>> {
  const byNum = new Map<number, VersePayload>();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url =
      `${QURAN_API}/verses/by_chapter/${number}` +
      `?language=fr&words=false&translations=${translationIds}` +
      `&fields=text_uthmani&per_page=300&page=${page}`;
    logger.info('quran-data: requête versets', { number, page, logLabel });
    const { data } = await axios.get<VersesResponse>(url, { timeout: 60_000 });
    const verses = data.verses ?? [];
    for (const v of verses) {
      const num = v.verse_number;
      if (typeof num !== 'number') continue;
      byNum.set(num, v);
    }
    hasMore = Boolean(data.pagination?.next_page);
    page += 1;
    if (page > 20) break;
  }

  return byNum;
}

async function fetchAllVerses(number: number): Promise<Verse[]> {
  const primary = await fetchVersePages(number, `${TRANSLATION_FR},${TRANSLATION_EN_LEGACY}`, 'fr+131');

  let enMap: Map<number, VersePayload> | null = null;
  const needsEnFallback = [...primary.values()].some(
    (v) => !translationText(v.translations, TRANSLATION_EN_LEGACY),
  );
  if (needsEnFallback) {
    logger.info('quran-data: complément anglais (resource_id 20)', { number });
    enMap = await fetchVersePages(number, String(TRANSLATION_EN_SAHIH), 'en-sahih');
  }

  const numbers = [...primary.keys()].sort((a, b) => a - b);
  return numbers.map((num) => {
    const v = primary.get(num)!;
    let en = translationText(v.translations, TRANSLATION_EN_LEGACY);
    if (!en && enMap) {
      en = translationText(enMap.get(num)?.translations, TRANSLATION_EN_SAHIH);
    }
    return {
      number: num,
      text_ar: (v.text_uthmani ?? '').trim(),
      translation_fr: translationText(v.translations, TRANSLATION_FR),
      translation_en: en,
    };
  });
}

export async function fetchSourateData(
  number: number,
): Promise<{ sourate: Sourate; verses: Verse[] }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      logger.info('quran-data: début fetch sourate', { number, attempt });
      const sourate = await fetchChapter(number);
      const verses = await fetchAllVerses(number);
      logger.info('quran-data: sourate chargée', { number, verses: verses.length });
      return { sourate, verses };
    } catch (err) {
      lastErr = err;
      logger.warn('quran-data: échec tentative', {
        number,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_MS);
    }
  }
  logger.error('quran-data: abandon après retries', { number });
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// Test direct : npx tsx src/modules/quran-data.ts
if (require.main === module) {
  fetchSourateData(1).then(data => {
    console.log('✅ Sourate:', data.sourate.name_fr);
    console.log('📖 Versets:', data.verses.length);
    console.log('🔤 Premier verset AR:', data.verses[0].text_ar);
    console.log('🇫🇷 Traduction FR:', data.verses[0].translation_fr);
    console.log('🇬🇧 Traduction EN:', data.verses[0].translation_en);
  }).catch(console.error);
}