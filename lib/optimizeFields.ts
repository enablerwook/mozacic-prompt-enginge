import { getUploadElapsedDays, type MockMozaicRow } from "@/lib/mockMozaicData";

/** Mock 테이블 열과 맞춘 최적화 컨텍스트 필드 + DB 전용 분석 필드 */
export type OptimizeContextField =
  | "title"
  | "description"
  | "script"
  | "createdAt"
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
  createdAt: false,
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

/** MockMozaicRow를 최적화 API용 한 줄로 직렬화 (체크된 필드만 포함) */
export function buildOptimizeHistoryLine(
  r: MockMozaicRow,
  include: Record<OptimizeContextField, boolean>,
  asOf: Date
): string {
  const parts: string[] = [];

  if (include.title && r.title?.trim()) {
    parts.push(`제목: ${r.title.trim()}`);
  }
  if (include.description) {
    parts.push(`proxy: ${r.description || "-"}`);
  }
  if (include.script) {
    const scriptPreview = r.script ? r.script.slice(0, 200) : "-";
    parts.push(`스크립트: ${scriptPreview}`);
  }
  if (include.createdAt && r.createdAt) {
    parts.push(`분석일시: ${r.createdAt.slice(0, 16).replace("T", " ")}`);
  }
  if (include.language) {
    parts.push(`플랫폼: ${r.language || "-"}`);
  }
  if (include.contentType) {
    parts.push(`콘텐츠타입: ${r.contentType || "-"}`);
  }
  if (include.views) {
    parts.push(`조회수: ${r.views}`);
  }
  if (include.likes) {
    parts.push(`좋아요: ${r.likes}`);
  }
  if (include.likeRatio) {
    const ratio = r.likeRatio ?? (r.views > 0 ? (r.likes / r.views) * 100 : 0);
    parts.push(`좋아요율: ${ratio.toFixed(2)}%`);
  }
  if (include.uploadDate) {
    parts.push(`업로드: ${r.date.slice(0, 16).replace("T", " ")}`);
  }
  if (include.elapsed) {
    const days = r.elapsedDays ?? getUploadElapsedDays(r.date, asOf);
    parts.push(`경과: D+${days}`);
  }
  if (include.hookScore) {
    parts.push(`훅점수: -`);
  }
  if (include.verdict) {
    parts.push(`판정: -`);
  }

  if (parts.length === 0) {
    return `proxy: ${r.description || "-"}`;
  }
  return parts.join(" | ");
}

function formatDplus(iso: string, asOf: Date) {
  const n = getUploadElapsedDays(iso, asOf);
  return `D+${n}`;
}
