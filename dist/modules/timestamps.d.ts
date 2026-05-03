import type { Verse } from '../types/index';
export interface TimestampOptions {
    /** Durée totale audio en secondes (approximation si pas d'analyse réelle). */
    durationSec?: number;
}
/**
 * Placeholder : répartition linéaire des timestamps par verset.
 * À remplacer par alignement forced-alignment / Whisper si besoin.
 */
export declare function assignLinearTimestamps(verses: Verse[], options?: TimestampOptions): Verse[];
//# sourceMappingURL=timestamps.d.ts.map