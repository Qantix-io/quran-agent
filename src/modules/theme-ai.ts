import OpenAI from 'openai';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Sourate, Verse, VisualTheme } from '../types/index';
import logger from '../utils/logger';

type ThemesFile = Record<string, Omit<VisualTheme, 'category'>>;

function loadThemes(): ThemesFile {
  const p = join(process.cwd(), 'src/config/themes.json');
  return JSON.parse(readFileSync(p, 'utf8')) as ThemesFile;
}

function getClient(): OpenAI {
  const key = readFileSync('.env', 'utf8').match(/QURAN_OPENAI_KEY=(.+)/)?.[1]?.trim();
  if (!key) throw new Error('QURAN_OPENAI_KEY manquante dans .env');
  return new OpenAI({ apiKey: key });
}

export async function analyzeTheme(
  sourate: Sourate,
  verses: Verse[],
): Promise<VisualTheme> {
  logger.info('theme-ai: analyse GPT-4o-mini', { sourate: sourate.number, name: sourate.name_fr });

  const themes = loadThemes();
  const themeKeys = Object.keys(themes).join(', ');
  const sample = verses.slice(0, 3).map(v => v.translation_fr).join(' | ');

  try {
    const client = getClient();

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: `Tu es un expert du Coran. Analyse cette sourate et choisis le thème visuel le plus adapté.

Sourate ${sourate.number} — ${sourate.name_fr} (${sourate.name_ar})
Versets : ${sourate.verses_count} | Type : ${sourate.revelation_type}
Extrait : ${sample}

Thèmes disponibles : ${themeKeys}

Réponds UNIQUEMENT avec le nom exact du thème (un seul mot parmi la liste).`,
      }],
    });

    const raw = response.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
    const chosen = raw in themes ? raw : sourate.theme_category in themes
      ? sourate.theme_category
      : 'tawhid';

    logger.info('theme-ai: thème choisi', { chosen, raw });

    const t = themes[chosen];
    return { category: chosen, keywords: t.keywords, mood: t.mood, color_palette: t.color_palette };

  } catch (err) {
    logger.warn('theme-ai: GPT échoué, fallback sourates.json', {
      error: err instanceof Error ? err.message : String(err),
    });
    const fallback = sourate.theme_category in themes ? sourate.theme_category : 'tawhid';
    const t = themes[fallback];
    return { category: fallback, keywords: t.keywords, mood: t.mood, color_palette: t.color_palette };
  }
}

// Test direct : npx tsx src/modules/theme-ai.ts
if (require.main === module) {
  import('dotenv').then(({ config }) => {
    config();
    const { fetchSourateData } = require('./quran-data');

    (async () => {
      const { sourate, verses } = await fetchSourateData(1);
      const theme = await analyzeTheme(sourate, verses);
      console.log('✅ Thème choisi:', theme.category);
      console.log('🎨 Mood:', theme.mood);
      console.log('🔑 Keywords:', theme.keywords.join(', '));
      console.log('🎨 Palette:', theme.color_palette);
    })().catch(console.error);
  });
}