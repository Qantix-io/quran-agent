import type { VisualTheme } from '../types/index';
export interface VisualPrompt {
    prompt: string;
    negativePrompt?: string;
}
/** Construit un prompt broll / image à partir du thème. */
export declare function buildVisualPrompt(theme: VisualTheme, verseHint?: string): VisualPrompt;
//# sourceMappingURL=visuals.d.ts.map