export interface VideoStats {
    views?: number;
    likes?: number;
    comments?: number;
}
/** Placeholder : récupération stats plateformes. */
export declare function fetchVideoStats(_platformIds: Record<string, string>): Promise<VideoStats>;
//# sourceMappingURL=analytics.d.ts.map