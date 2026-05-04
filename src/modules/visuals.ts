import axios from 'axios';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { VisualTheme } from '../types/index';
import logger from '../utils/logger';

const PEXELS_API = 'https://api.pexels.com/v1';

// Mots-clés interdits — jamais dans les requêtes Pexels
const FORBIDDEN_KEYWORDS = [
  'mosaic', 'mosaique', 'mosaïque', 'tile', 'tiles', 'pattern', 'geometric',
  'person', 'people', 'man', 'woman', 'human', 'face', 'portrait', 'crowd',
  'hands', 'body', 'child', 'children', 'baby', 'group',
  'architecture', 'building', 'city', 'urban', 'street', 'mosque interior',
  'calligraphy', 'arabic text', 'quran book',
];

// Mots-clés de remplacement sûrs — nature, univers, cieux
const SAFE_FALLBACK_KEYWORDS = [
  'starry sky night',
  'golden sunrise clouds',
  'ocean horizon sunset',
  'mountain landscape peaceful',
  'desert dunes golden',
  'green valley nature',
  'milky way galaxy',
  'forest light rays',
];

interface PexelsPhoto {
  id: number;
  src: { original: string; large2x: string; large: string };
  alt: string;
}

interface PexelsResponse {
  photos: PexelsPhoto[];
  total_results: number;
}

function getPexelsKey(): string {
  const key = require('fs').readFileSync('.env', 'utf8')
    .match(/PEXELS_API_KEY=(.+)/)?.[1]?.trim();
  if (!key) throw new Error('PEXELS_API_KEY manquante dans .env');
  return key;
}

function isForbidden(keyword: string): boolean {
  const lower = keyword.toLowerCase();
  return FORBIDDEN_KEYWORDS.some(f => lower.includes(f));
}

function sanitizeKeyword(keyword: string): string {
  // Remplace les mots interdits par des mots sûrs
  if (isForbidden(keyword)) {
    const idx = Math.floor(Math.random() * SAFE_FALLBACK_KEYWORDS.length);
    const safe = SAFE_FALLBACK_KEYWORDS[idx];
    logger.warn('visuals: keyword interdit remplacé', { original: keyword, replacement: safe });
    return safe;
  }
  // Ajoute "nature" si le keyword est trop vague ou risqué
  const lower = keyword.toLowerCase();
  if (!lower.includes('sky') && !lower.includes('nature') && !lower.includes('ocean') &&
      !lower.includes('mountain') && !lower.includes('forest') && !lower.includes('desert') &&
      !lower.includes('star') && !lower.includes('sun') && !lower.includes('cloud') &&
      !lower.includes('galaxy') && !lower.includes('light') && !lower.includes('landscape')) {
    return `${keyword} nature landscape`;
  }
  return keyword;
}

async function searchPhotos(query: string, perPage = 5): Promise<PexelsPhoto[]> {
  const key = getPexelsKey();
  // Force orientation portrait + filtre nature
  const safeQuery = sanitizeKeyword(query);
  const { data } = await axios.get<PexelsResponse>(`${PEXELS_API}/search`, {
    headers: { Authorization: key },
    params: {
      query: safeQuery,
      per_page: perPage,
      orientation: 'portrait',
    },
    timeout: 30_000,
  });
  return data.photos ?? [];
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  const res = await axios.get(url, { responseType: 'stream', timeout: 60_000 });
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(destPath);
    res.data.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

export async function fetchVisuals(
  theme: VisualTheme,
  sourateNumber: number,
): Promise<string[]> {
  // Sanitize tous les keywords du thème
  const safeKeywords = theme.keywords.map(sanitizeKeyword);

  logger.info('visuals: recherche images Pexels', {
    sourateNumber,
    category: theme.category,
    keywords: safeKeywords,
  });

  const tmpDir = path.join(process.cwd(), 'tmp', `visuals_${sourateNumber}`);
  mkdirSync(tmpDir, { recursive: true });

  const paths: string[] = [];

  for (let i = 0; i < Math.min(3, safeKeywords.length); i++) {
    const keyword = safeKeywords[i];
    try {
      const photos = await searchPhotos(keyword, 5);
      if (photos.length === 0) {
        // Fallback sur un keyword sûr garanti
        const fallback = SAFE_FALLBACK_KEYWORDS[i % SAFE_FALLBACK_KEYWORDS.length];
        logger.warn('visuals: aucune photo, fallback', { keyword, fallback });
        const fallbackPhotos = await searchPhotos(fallback, 5);
        if (fallbackPhotos.length === 0) continue;
        const photo = fallbackPhotos[0];
        const destPath = path.join(tmpDir, `image_${i + 1}.jpg`);
        await downloadImage(photo.src.large2x || photo.src.large, destPath);
        paths.push(destPath);
        continue;
      }

      const photo = photos[0];
      const destPath = path.join(tmpDir, `image_${i + 1}.jpg`);
      await downloadImage(photo.src.large2x || photo.src.large, destPath);
      paths.push(destPath);
      logger.info('visuals: image téléchargée', { keyword, path: destPath });
    } catch (err) {
      logger.warn('visuals: erreur keyword', {
        keyword,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (paths.length === 0) throw new Error('Aucune image téléchargée depuis Pexels');

  logger.info('visuals: images prêtes', { count: paths.length, sourateNumber });
  return paths;
}

if (require.main === module) {
  import('dotenv').then(({ config }) => {
    config();
    const { fetchSourateData } = require('./quran-data');
    const { analyzeTheme } = require('./theme-ai');
    (async () => {
      const { sourate, verses } = await fetchSourateData(114);
      const theme = await analyzeTheme(sourate, verses);
      const images = await fetchVisuals(theme, 114);
      console.log('✅ Images téléchargées:');
      images.forEach(p => console.log(' -', p));
    })().catch(console.error);
  });
}