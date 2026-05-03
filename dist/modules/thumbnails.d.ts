export interface ThumbnailJob {
    outPath: string;
    title?: string;
}
/** Placeholder : génération image (Sharp / FFmpeg) à brancher plus tard. */
export declare function generateThumbnail(job: ThumbnailJob): Promise<string>;
//# sourceMappingURL=thumbnails.d.ts.map