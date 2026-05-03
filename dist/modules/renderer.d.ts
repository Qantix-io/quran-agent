export interface RenderJob {
    audioPath: string;
    videoOutPath: string;
    /** Chemins d'images / clips à muxer (placeholder). */
    assets?: string[];
}
/**
 * Placeholder : ici FFmpeg composera fond + audio + sous-titres.
 * Retourne le chemin de sortie prévu.
 */
export declare function renderVideo(job: RenderJob): Promise<string>;
//# sourceMappingURL=renderer.d.ts.map