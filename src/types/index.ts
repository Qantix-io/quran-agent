export interface Sourate {
  number: number;
  name_ar: string;
  name_fr: string;
  name_en: string;
  verses_count: number;
  revelation_type: 'Meccan' | 'Medinan';
  theme_category: string;
}

export interface Verse {
  number: number;
  text_ar: string;
  translation_fr: string;
  translation_en: string;
  timestamp_start?: number;
  timestamp_end?: number;
}

export interface PipelineState {
  current_sourate: number;
  status: 'idle' | 'running' | 'error' | 'paused';
  last_published_at: string | null;
  total_published: number;
  retry_count: number;
  last_error: string | null;
}

export interface VideoMetadata {
  title_fr: string;
  title_en: string;
  title_ar: string;
  description_fr: string;
  description_en: string;
  tags_fr: string[];
  tags_en: string[];
  tags_ar: string[];
}

export interface VisualTheme {
  category: string;
  keywords: string[];
  mood: string;
  color_palette: string;
}
