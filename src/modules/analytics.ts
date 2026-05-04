import { google } from 'googleapis';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import logger from '../utils/logger';

export interface VideoStats {
  views?: number;
  likes?: number;
  comments?: number;
  retentionRate?: number;
  platform: string;
  videoId: string;
}

function getKey(name: string): string {
  const raw = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  if (!match?.[1]?.trim()) throw new Error(`${name} manquante dans .env`);
  return match[1].trim();
}

function getYouTubeClient() {
  const oauth2Client = new google.auth.OAuth2(
    getKey('YOUTUBE_CLIENT_ID'),
    getKey('YOUTUBE_CLIENT_SECRET'),
    'http://localhost:3000/callback',
  );
  oauth2Client.setCredentials({
    refresh_token: getKey('YOUTUBE_REFRESH_TOKEN'),
  });
  return google.youtube({ version: 'v3', auth: oauth2Client });
}

async function fetchYouTubeStats(videoId: string): Promise<VideoStats> {
  logger.info('analytics: fetch YouTube stats', { videoId });

  const youtube = getYouTubeClient();

  const res = await youtube.videos.list({
    part: ['statistics'],
    id: [videoId],
  });

  const stats = res.data.items?.[0]?.statistics;

  if (!stats) {
    logger.warn('analytics: pas de stats YouTube', { videoId });
    return { platform: 'youtube', videoId };
  }

  const result: VideoStats = {
    platform: 'youtube',
    videoId,
    views: parseInt(stats.viewCount ?? '0'),
    likes: parseInt(stats.likeCount ?? '0'),
    comments: parseInt(stats.commentCount ?? '0'),
  };

  logger.info('analytics: YouTube stats récupérées', result);
  return result;
}

export async function fetchVideoStats(platformIds: {
  youtubeShortId?: string;
  youtubeLongId?: string;
  tiktokId?: string;
}): Promise<VideoStats[]> {
  const results: VideoStats[] = [];

  if (platformIds.youtubeLongId) {
    try {
      const stats = await fetchYouTubeStats(platformIds.youtubeLongId);
      results.push(stats);
    } catch (err) {
      logger.error('analytics: YouTube long échoué', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (platformIds.youtubeShortId) {
    try {
      const stats = await fetchYouTubeStats(platformIds.youtubeShortId);
      results.push({ ...stats, platform: 'youtube_short' });
    } catch (err) {
      logger.error('analytics: YouTube short échoué', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

// Test direct : npx tsx src/modules/analytics.ts
if (require.main === module) {
  require('dotenv').config({ path: path.join(process.cwd(), '.env') });

  void (async () => {
    // IDs des vidéos Al-Fatiha publiées précédemment
    const results = await fetchVideoStats({
      youtubeLongId: 'xHoBnB4iPxU',
      youtubeShortId: 'NKu9fpBrdiM',
    });

    results.forEach(r => {
      console.log(`✅ ${r.platform} (${r.videoId})`);
      console.log(`   👁️  Vues: ${r.views}`);
      console.log(`   ❤️  Likes: ${r.likes}`);
      console.log(`   💬 Commentaires: ${r.comments}`);
    });
  })().catch(console.error);
}