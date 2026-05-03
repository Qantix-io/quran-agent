import logger from '../utils/logger';

export interface ThumbnailJob {
  outPath: string;
  title?: string;
}

/** Placeholder : génération image (Sharp / FFmpeg) à brancher plus tard. */
export async function generateThumbnail(job: ThumbnailJob): Promise<string> {
  logger.warn('thumbnails: stub — aucun fichier produit', { outPath: job.outPath });
  return job.outPath;
}
