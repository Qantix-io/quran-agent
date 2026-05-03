import logger from '../utils/logger';

export interface VideoStats {
  views?: number;
  likes?: number;
  comments?: number;
}

export async function fetchVideoStats(_platformIds: Record<string, string>): Promise<VideoStats> {
  logger.debug('analytics: stub');
  return {};
}
