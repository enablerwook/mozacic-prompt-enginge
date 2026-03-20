export interface AnalyzeInput {
  text: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
}

export interface AnalyzeResult {
  s_threat: number;
  s_threat_r: string;
  s_loss: number;
  s_loss_r: string;
  s_uncert: number;
  s_uncert_r: string;
  s_total: number;
  r_phys: number;
  r_phys_r: string;
  r_status: number;
  r_status_r: string;
  r_charm: number;
  r_charm_r: string;
  r_total: number;
  e_speed: number;
  e_speed_r: string;
  e_clarity: number;
  e_clarity_r: string;
  e_intense: number;
  e_intense_r: string;
  e_total: number;
  e_dominant: string;
  hook: string;
  motivation: string;
  score: number;
  verdict: string;
  tip: string;
  disc_label: string;
  disc_maps: string;
  disc_desc: string;
}

export interface DatasetRow {
  id: string;
  title?: string | null;
  description?: string | null;
  viewer_sentiment?: string | null;
  ref_gemini?: string | null;
  ref_mozaic?: string | null;
  ref_claude?: string | null;
  ref_chatgpt?: string | null;
  ground_truth?: string | null;
  created_at?: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
}

export interface OptimizeResult {
  diagnosis: string;
  weak_items: string;
  missing_factors: string;
  weight_suggestion: string;
  prompt: string;
  changes: string;
  version: string;
}
