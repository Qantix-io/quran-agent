"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSourateData = fetchSourateData;
const axios_1 = __importDefault(require("axios"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const logger_1 = __importDefault(require("../utils/logger"));
const QURAN_API = 'https://api.quran.com/api/v4';
/** Français (API v4 — ressource 136). */
const TRANSLATION_FR = 136;
/** Sahih International : l’API historique citait 131 ; la v4 expose surtout l’id 20. */
const TRANSLATION_EN_LEGACY = 131;
const TRANSLATION_EN_SAHIH = 20;
const MAX_ATTEMPTS = 3;
const RETRY_MS = 2000;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function loadLocalSourate(number) {
    try {
        const raw = (0, node_fs_1.readFileSync)((0, node_path_1.join)(process.cwd(), 'src/config/sourates.json'), 'utf8');
        const list = JSON.parse(raw);
        return list.find((s) => s.number === number) ?? null;
    }
    catch {
        return null;
    }
}
function revelationFromPlace(place) {
    const p = (place ?? '').toLowerCase();
    if (p.includes('madin'))
        return 'Medinan';
    return 'Meccan';
}
function translationText(translations, resourceId) {
    if (!Array.isArray(translations))
        return '';
    const hit = translations.find((t) => t.resource_id === resourceId);
    return stripFootnotes((hit?.text ?? '').trim());
}
function stripFootnotes(html) {
    return html.replace(/<sup[^>]*>.*?<\/sup>/gi, '').replace(/<[^>]+>/g, '').trim();
}
async function fetchChapter(number) {
    const url = `${QURAN_API}/chapters/${number}?language=fr`;
    logger_1.default.info('quran-data: requête métadonnées sourate', { number, url });
    const { data } = await axios_1.default.get(url, { timeout: 30_000 });
    const ch = data.chapter;
    if (!ch?.id)
        throw new Error('Réponse chapitre invalide');
    const local = loadLocalSourate(number);
    const name_fr = ch.translated_name?.name?.trim() ||
        local?.name_fr ||
        ch.name_simple ||
        '';
    const name_en = ch.name_simple?.trim() || local?.name_en || '';
    const name_ar = ch.name_arabic?.trim() || local?.name_ar || '';
    const verses_count = ch.verses_count ?? local?.verses_count ?? 0;
    const revelation_type = revelationFromPlace(ch.revelation_place);
    const theme_category = local?.theme_category ?? 'tawhid';
    return {
        number: ch.id,
        name_ar,
        name_fr,
        name_en,
        verses_count,
        revelation_type,
        theme_category,
    };
}
async function fetchVersePages(number, translationIds, logLabel) {
    const byNum = new Map();
    let page = 1;
    let hasMore = true;
    while (hasMore) {
        const url = `${QURAN_API}/verses/by_chapter/${number}` +
            `?language=fr&words=false&translations=${translationIds}` +
            `&fields=text_uthmani&per_page=300&page=${page}`;
        logger_1.default.info('quran-data: requête versets', { number, page, logLabel });
        const { data } = await axios_1.default.get(url, { timeout: 60_000 });
        const verses = data.verses ?? [];
        for (const v of verses) {
            const num = v.verse_number;
            if (typeof num !== 'number')
                continue;
            byNum.set(num, v);
        }
        hasMore = Boolean(data.pagination?.next_page);
        page += 1;
        if (page > 20)
            break;
    }
    return byNum;
}
async function fetchAllVerses(number) {
    const primary = await fetchVersePages(number, `${TRANSLATION_FR},${TRANSLATION_EN_LEGACY}`, 'fr+131');
    let enMap = null;
    const needsEnFallback = [...primary.values()].some((v) => !translationText(v.translations, TRANSLATION_EN_LEGACY));
    if (needsEnFallback) {
        logger_1.default.info('quran-data: complément anglais (resource_id 20 Sahih International)', { number });
        enMap = await fetchVersePages(number, String(TRANSLATION_EN_SAHIH), 'en-sahih');
    }
    const numbers = [...primary.keys()].sort((a, b) => a - b);
    const collected = numbers.map((num) => {
        const v = primary.get(num);
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
    return collected;
}
async function fetchSourateData(number) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            logger_1.default.info('quran-data: début fetch sourate', { number, attempt, max: MAX_ATTEMPTS });
            const sourate = await fetchChapter(number);
            const verses = await fetchAllVerses(number);
            logger_1.default.info('quran-data: sourate chargée', {
                number,
                verses: verses.length,
                expected: sourate.verses_count,
            });
            return { sourate, verses };
        }
        catch (err) {
            lastErr = err;
            logger_1.default.warn('quran-data: échec tentative', {
                number,
                attempt,
                error: err instanceof Error ? err.message : String(err),
            });
            if (attempt < MAX_ATTEMPTS)
                await sleep(RETRY_MS);
        }
    }
    logger_1.default.error('quran-data: abandon après retries', {
        number,
        error: lastErr instanceof Error ? lastErr.message : String(lastErr),
    });
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
//# sourceMappingURL=quran-data.js.map