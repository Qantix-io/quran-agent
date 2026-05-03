import axios from 'axios';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { VisualTheme } from '../types/index';
import logger from '../utils/logger';

const PEXELS_API = 'https://api.pexels.com/v1';

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

async function searchPhotos(query: string, perPage = 5): Promise<PexelsPhoto[]> {
  const key = getPexelsKey();
  const { data } = await axios.get<PexelsResponse>(`${PEXELS_API}/search`, {
    headers: { Authorization: key },
    params: { query, per_page: perPage, orientation: 'portrait' },
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
  logger.info('visuals: recherche images Pexels', {
    sourateNumber,
    category: theme.category,
    keywords: theme.keywords,
  });

  const tmpDir = path.join(process.cwd(), 'tmp', `visuals_${sourateNumber}`);
  mkdirSync(tmpDir, { recursive: true });

  const paths: string[] = [];

  for (let i = 0; i < Math.min(3, theme.keywords.length); i++) {
    const keyword = theme.keywords[i];
    try {
      const photos = await searchPhotos(keyword, 3);
      if (photos.length === 0) {
        logger.warn('visuals: aucune photo pour keyword', { keyword });
        continue;
      }

      const photo = photos[0];
      const ext = 'jpg';
      const destPath = path.join(tmpDir, `image_${i + 1}.${ext}`);

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

// Test direct : npx tsx src/modules/visuals.ts
if (require.main === module) {
  import('dotenv').then(({ config }) => {
    config();
    const { fetchSourateData } = require('./quran-data');
    const { analyzeTheme } = require('./theme-ai');

    (async () => {
      const { sourate, verses } = await fetchSourateData(1);
      const theme = await analyzeTheme(sourate, verses);
      const images = await fetchVisuals(theme, 1);
      console.log('✅ Images téléchargées:');
      images.forEach(p => console.log(' -', p));
    })().catch(console.error);
  });
}