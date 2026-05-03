import OpenAI from 'openai';
import { readFileSync } from 'node:fs';
import type { Sourate, VideoMetadata } from '../types/index';
import logger from '../utils/logger';

function getClient(): OpenAI {
  const key = readFileSync('.env', 'utf8').match(/QURAN_OPENAI_KEY=(.+)/)?.[1]?.trim();
  if (!key) throw new Error('QURAN_OPENAI_KEY manquante dans .env');
  return new OpenAI({ apiKey: key });
}

function buildFallbackMetadata(sourate: Sourate): VideoMetadata {
  const n = sourate.number;
  return {
    title_fr: `Sourate ${n} · ${sourate.name_fr} · Récitation Mishary Al-Afasy | Traduction Française`,
    title_en: `Surah ${n} · ${sourate.name_en} · Mishary Al-Afasy Recitation | French Translation`,
    title_ar: `سورة ${sourate.name_ar} · تلاوة مشاري العفاسي`,
    description_fr: `Récitation complète de la Sourate ${n} — ${sourate.name_fr} (${sourate.name_ar}) par le récitateur Mishary Rashid Al-Afasy.\n\n📖 ${sourate.verses_count} versets | ${sourate.revelation_type}\n🌍 Traduction française synchronisée\n\n#Coran #Sourate${n} #${sourate.name_fr.replace(/\s/g, '')} #Islam #Récitation #القرآن`,
    description_en: `Full recitation of Surah ${n} — ${sourate.name_en} (${sourate.name_ar}) by Mishary Rashid Al-Afasy.\n\n📖 ${sourate.verses_count} verses | ${sourate.revelation_type}\n🌍 French translation synchronized\n\n#Quran #Surah${n} #${sourate.name_en.replace(/\s/g, '')} #Islam #Recitation #القرآن`,
    tags_fr: [
      'Coran', 'Quran', 'récitation', 'islam', 'sourate',
      sourate.name_fr, `sourate ${n}`, 'Mishary Al-Afasy',
      'traduction française', 'القرآن الكريم',
      sourate.theme_category, 'meditation', 'spiritualité',
    ],
    tags_en: [
      'Quran', 'Islam', 'recitation', 'surah', sourate.name_en,
      `surah ${n}`, 'Mishary Al-Afasy', 'french translation',
      'arabic', sourate.theme_category, 'meditation', 'spirituality',
    ],
    tags_ar: [
      'القرآن الكريم', 'تلاوة', sourate.name_ar,
      'مشاري العفاسي', 'إسلام', 'قرآن',
    ],
  };
}

export async function generateMetadata(sourate: Sourate): Promise<VideoMetadata> {
  logger.info('metadata: génération GPT-4o-mini', { sourate: sourate.number });

  try {
    const client = getClient();

    const prompt = `Tu es un expert en SEO YouTube et TikTok spécialisé dans le contenu islamique francophone.

Génère des métadonnées optimisées pour une vidéo de récitation coranique.

Sourate ${sourate.number} — ${sourate.name_fr} (${sourate.name_ar} / ${sourate.name_en})
Versets : ${sourate.verses_count} | Type : ${sourate.revelation_type} | Thème : ${sourate.theme_category}
Récitateur : Mishary Rashid Al-Afasy
Contenu : Récitation arabe + traduction française synchronisée

Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "title_fr": "titre YouTube FR optimisé SEO (max 100 chars)",
  "title_en": "YouTube title EN optimized SEO (max 100 chars)",
  "title_ar": "عنوان عربي (max 80 chars)",
  "description_fr": "description FR complète avec emojis et hashtags (max 500 chars)",
  "description_en": "full EN description with emojis and hashtags (max 500 chars)",
  "tags_fr": ["tag1", "tag2", "...jusqu'à 15 tags FR/AR pertinents"],
  "tags_en": ["tag1", "tag2", "...up to 15 relevant EN tags"],
  "tags_ar": ["وسم1", "وسم2", "...حتى 10 وسوم"]
}`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as VideoMetadata;

    logger.info('metadata: métadonnées générées par GPT', { sourate: sourate.number });
    return parsed;

  } catch (err) {
    logger.warn('metadata: GPT échoué, fallback statique', {
      error: err instanceof Error ? err.message : String(err),
    });
    return buildFallbackMetadata(sourate);
  }
}

// Test direct : npx tsx src/modules/metadata.ts
if (require.main === module) {
  require('dotenv').config();
  const { fetchSourateData } = require('./quran-data') as typeof import('./quran-data');

  void (async () => {
    const { sourate } = await fetchSourateData(1);
    const meta = await generateMetadata(sourate);
    console.log('✅ Titre FR:', meta.title_fr);
    console.log('✅ Titre EN:', meta.title_en);
    console.log('✅ Titre AR:', meta.title_ar);
    console.log('📝 Description FR:', meta.description_fr);
    console.log('🏷️  Tags FR:', meta.tags_fr.join(', '));
    console.log('🏷️  Tags EN:', meta.tags_en.join(', '));
    console.log('🏷️  Tags AR:', meta.tags_ar.join(', '));
  })().catch(console.error);
}