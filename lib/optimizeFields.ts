import { getUploadElapsedDays } from "@/lib/mockMozaicData";
import type { AnalyzeResult, DatasetRow } from "@/types";

/** Mock 테이블 열과 맞춘 최적화 컨텍스트 필드 + DB 전용 분석 필드 */
export type OptimizeContextField =
  | "title"
  | "description"
  | "script"
  | "language"
  | "contentType"
  | "views"
  | "likes"
  | "likeRatio"
  | "uploadDate"
  | "elapsed"
  | "hookScore"
  | "verdict";

export const DEFAULT_OPTIMIZE_FIELDS: Record<OptimizeContextField, boolean> = {
  title: true,
  description: true,
  script: true,
  language: true,
  contentType: true,
  views: true,
  likes: true,
  likeRatio: true,
  uploadDate: true,
  elapsed: true,
  hookScore: true,
  verdict: true,
};

function parseGroundTruth(value?: string | null): AnalyzeResult | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as AnalyzeResult;
  } catch {
    return null;
  }
}

/** datasets 행을 최적화 API용 한 줄로 직렬화 (체크된 필드만 포함) */
export function buildOptimizeHistoryLine(
  r: DatasetRow,
  include: Record<OptimizeContextField, boolean>,
  asOf: Date
): string {
  const parsed = parseGroundTruth(r.ground_truth);
  const parts: string[] = [];

  if (include.title && r.title?.trim()) {
    parts.push(`제목: ${r.title.trim()}`);
  }
  if (include.description) {
    parts.push(`proxy: ${r.description ?? "-"}`);
  }
  if (include.script) {
    parts.push(`스크립트: ${r.script ?? "-"}`);
  }
  if (include.language) {
    parts.push(`언어: —`);
  }
  if (include.contentType) {
    parts.push(`콘텐츠타입: —`);
  }
  if (include.views) {
    parts.push(`조회수: ${r.views ?? "-"}`);
  }
  if (include.likes) {
    parts.push(`좋아요: ${r.likes ?? "-"}`);
  }
  if (include.likeRatio) {
    const v = r.views;
    const l = r.likes;
    if (typeof v === "number" && v > 0 && typeof l === "number") {
      parts.push(`좋아요율: ${((l / v) * 100).toFixed(2)}%`);
    } else {
      parts.push(`좋아요율: —`);
    }
  }
  if (include.uploadDate && r.created_at) {
    parts.push(`업로드: ${r.created_at.slice(0, 16).replace("T", " ")}`);
  }
  if (include.elapsed && r.created_at) {
    parts.push(`경과: ${formatDplus(r.created_at, asOf)}`);
  }
  if (include.hookScore) {
    parts.push(`훅점수: ${parsed?.score ?? "-"}`);
  }
  if (include.verdict) {
    parts.push(`판정: ${parsed?.verdict ?? "-"}`);
  }

  if (parts.length === 0) {
    return `proxy: ${r.description ?? "-"}`;
  }
  return parts.join(" | ");
}

function formatDplus(iso: string, asOf: Date) {
  const n = getUploadElapsedDays(iso, asOf);
  return `D+${n}`;
}
