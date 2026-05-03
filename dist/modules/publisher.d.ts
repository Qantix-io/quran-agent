import type { VideoMetadata } from '../types/index';
export interface PublishInput {
    videoPath: string;
    thumbnailPath?: string;
    metadata: VideoMetadata;
}
export interface PublishResult {
    youtubeVideoId?: string;
    tiktokPublishId?: string;
}
/** Placeholder : branchement APIs YouTube / TikTok (OAuth, upload resumable, etc.). */
export declare function publishEverywhere(input: PublishInput): Promise<PublishResult>;
//# sourceMappingURL=publisher.d.ts.map