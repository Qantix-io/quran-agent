import { google } from 'googleapis';
import { createReadStream, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import type { VideoMetadata } from '../types/index';
import logger from '../utils/logger';

export interface PublishInput {
  shortPath: string;
  longPath: string;
  metadata: VideoMetadata;
  sourateNumber: number;
}

export interface PublishResult {
  youtubeShortId?: string;
  youtubeLongId?: string;
  tiktokPublishId?: string;
}

let envCache: Record<string, string> | null = null;

/** Parse .env (readFileSync) : première occurrence de clé, guillemets optionnels. */
function loadEnvMap(): Record<string, string> {
  const raw = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const map: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in map)) map[k] = v;
  }
  return map;
}

function getKey(name: string): string {
  if (!envCache) envCache = loadEnvMap();
  const v = envCache[name]?.trim();
  if (!v) throw new Error(`${name} manquante dans .env`);
  return v;
}

/** Doit être **identique** à l’URI configurée dans Google Cloud + celle utilisée pour obtenir le refresh token. */
function getYouTubeRedirectUri(): string {
  if (!envCache) envCache = loadEnvMap();
  return (
    envCache.YOUTUBE_REDIRECT_URI?.trim() ||
    'http://localhost:3000/callback'
  );
}

function logGoogleApiError(context: string, err: unknown): void {
  const e = err as {
    message?: string;
    code?: string | number;
    response?: { status?: number; statusText?: string; data?: unknown; headers?: Record<string, unknown> };
    errors?: unknown;
    stack?: string;
  };
  logger.error('publisher: erreur API (détail)', {
    context,
    message: e?.message,
    code: e?.code,
    status: e?.response?.status,
    statusText: e?.response?.statusText,
    responseData: e?.response?.data,
    errors: e?.errors,
    wwwAuthenticate: e?.response?.headers?.['www-authenticate'],
  });
  try {
    logger.error('publisher: erreur sérialisée', {
      serialized: JSON.stringify(err, Object.getOwnPropertyNames(Object(err))),
    });
  } catch {
    logger.error('publisher: impossible de sérialiser l’erreur');
  }
  if (e?.stack) logger.error('publisher: stack', { stack: e.stack });
}

function getYouTubeClient() {
  const oauth2Client = new google.auth.OAuth2(
    getKey('YOUTUBE_CLIENT_ID'),
    getKey('YOUTUBE_CLIENT_SECRET'),
    getYouTubeRedirectUri(),
  );
  oauth2Client.setCredentials({
    refresh_token: getKey('YOUTUBE_REFRESH_TOKEN'),
  });
  return { youtube: google.youtube({ version: 'v3', auth: oauth2Client }), oauth2Client };
}

async function uploadToYouTube(
  videoPath: string,
  metadata: VideoMetadata,
  isShort: boolean,
): Promise<string> {
  const { youtube, oauth2Client } = getYouTubeClient();
  const fileSize = statSync(videoPath).size;
  const description = isShort
    ? metadata.description_fr + '\n\n#Shorts'
    : metadata.description_fr;

  logger.info('publisher: upload YouTube', {
    videoPath,
    isShort,
    fileSize,
    redirectUri: getYouTubeRedirectUri(),
  });

  try {
    await oauth2Client.getAccessToken();
  } catch (e) {
    logGoogleApiError('getAccessToken avant upload', e);
    throw e;
  }

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: metadata.title_fr.substring(0, 100),
        description: description.substring(0, 5000),
        tags: [...metadata.tags_fr, ...metadata.tags_en].slice(0, 30),
        categoryId: '22',
        defaultLanguage: 'fr',
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: createReadStream(videoPath),
    },
  } as any);

  const videoId = res.data.id!;
  logger.info('publisher: YouTube upload OK', { videoId, isShort });
  return videoId;
}

async function uploadToTikTok(
  videoPath: string,
  metadata: VideoMetadata,
): Promise<string> {
  const accessToken = getKey('TIKTOK_ACCESS_TOKEN');
  const fileSize = statSync(videoPath).size;

  logger.info('publisher: upload TikTok', { videoPath });

  const initRes = await axios.post(
    'https://open.tiktokapis.com/v2/post/publish/video/init/',
    {
      post_info: {
        title: metadata.title_fr.substring(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: fileSize,
        chunk_size: fileSize,
        total_chunk_count: 1,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  );

  const { publish_id, upload_url } = initRes.data.data;
  logger.info('publisher: TikTok init OK', { publish_id });

  const fileBuffer = readFileSync(videoPath);
  await axios.put(upload_url, fileBuffer, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
      'Content-Length': fileSize,
    },
  });

  logger.info('publisher: TikTok upload OK', { publish_id });
  return publish_id;
}

export async function publishEverywhere(input: PublishInput): Promise<PublishResult> {
  const { shortPath, longPath, metadata } = input;
  const result: PublishResult = {};

  try {
    result.youtubeLongId = await uploadToYouTube(longPath, metadata, false);
    logger.info('publisher: YouTube long OK', { id: result.youtubeLongId });
  } catch (err) {
    logGoogleApiError('YouTube long upload', err);
  }

  try {
    result.youtubeShortId = await uploadToYouTube(shortPath, metadata, true);
    logger.info('publisher: YouTube short OK', { id: result.youtubeShortId });
  } catch (err) {
    logGoogleApiError('YouTube short upload', err);
  }

  try {
    result.tiktokPublishId = await uploadToTikTok(shortPath, metadata);
    logger.info('publisher: TikTok OK', { id: result.tiktokPublishId });
  } catch (err) {
    logger.error('publisher: TikTok échoué', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(process.cwd(), '.env') });
  const { fetchSourateData } = require('./quran-data') as typeof import('./quran-data');
  const { generateMetadata } = require('./metadata') as typeof import('./metadata');

  void (async () => {
    logger.info('publisher:test — Al-Fatiha');
    const { sourate } = await fetchSourateData(1);
    const metadata = await generateMetadata(sourate);

    const result = await publishEverywhere({
      shortPath: path.join(process.cwd(), 'output/sourate_1_short.mp4'),
      longPath: path.join(process.cwd(), 'output/sourate_1_long.mp4'),
      metadata,
      sourateNumber: 1,
    });

    console.log('✅ YouTube Long:', result.youtubeLongId);
    console.log('✅ YouTube Short:', result.youtubeShortId);
    console.log('✅ TikTok:', result.tiktokPublishId);
  })().catch(console.error);
}
