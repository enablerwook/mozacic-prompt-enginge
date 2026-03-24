"use client";

type Props = {
  history: (number | null)[];  // 회차별 훅점수 상관계수
  loading?: boolean;
};

const W = 540;
const H = 160;
const PAD = { top: 28, right: 20, bottom: 32, left: 48 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

const Y_MIN = -1;
const Y_MAX = 1;

function toY(v: number) {
  return PAD.top + ((Y_MAX - v) / (Y_MAX - Y_MIN)) * INNER_H;
}

function toX(i: number, total: number) {
  if (total <= 1) return PAD.left + INNER_W / 2;
  return PAD.left + (i / (total - 1)) * INNER_W;
}

const Y_TICKS = [-1, -0.5, 0, 0.5, 1];

export default function CorrChart({ history, loading }: Props) {
  const valid = history.filter((v): v is number => v !== null);
  const isEmpty = valid.length === 0;

  const points = history.map((v, i) => ({
    x: toX(i, history.length),
    y: v !== null ? toY(v) : null,
    v,
    label: `${i + 1}회`,
  }));

  // 선 경로 — null 건너뜀
  const pathParts: string[] = [];
  let inPath = false;
  for (const p of points) {
    if (p.y === null) { inPath = false; continue; }
    if (!inPath) { pathParts.push(`M ${p.x} ${p.y}`); inPath = true; }
    else { pathParts.push(`L ${p.x} ${p.y}`); }
  }
  const pathD = pathParts.join(" ");

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900">
          훅점수 상관계수 추이
          <span className="ml-2 text-xs font-normal text-zinc-400">(훅점수 ↔ 조회수)</span>
        </p>
        {loading && (
          <span className="text-xs text-blue-500 animate-pulse">실시간 업데이트 중…</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: "180px" }}
        aria-label="훅점수 상관계수 추이 차트"
      >
        {/* Y축 눈금선 + 라벨 */}
        {Y_TICKS.map((tick) => {
          const y = toY(tick);
          const isZero = tick === 0;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={PAD.left + INNER_W}
                y1={y}
                y2={y}
                stroke={isZero ? "#a1a1aa" : "#e4e4e7"}
                strokeWidth={isZero ? 1.5 : 1}
                strokeDasharray={isZero ? "none" : "4 3"}
              />
              <text
                x={PAD.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="#a1a1aa"
              >
                {tick === 0 ? "0" : tick > 0 ? `+${tick}` : tick}
              </text>
            </g>
          );
        })}

        {/* 빈 상태 안내 */}
        {isEmpty && (
          <text
            x={PAD.left + INNER_W / 2}
            y={PAD.top + INNER_H / 2 + 4}
            textAnchor="middle"
            fontSize={12}
            fill="#a1a1aa"
          >
            최적화 실행 후 표시됩니다
          </text>
        )}

        {/* 라인 */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="#2563eb"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* 점 + 값 라벨 + X축 라벨 */}
        {points.map((p, i) => {
          if (p.y === null) return null;
          const isLast = i === points.length - 1;
          const labelY = p.y - 10;
          const clampedLabelY = Math.max(PAD.top + 4, labelY);
          return (
            <g key={i}>
              {/* X축 라벨 */}
              <text
                x={p.x}
                y={H - 6}
                textAnchor="middle"
                fontSize={10}
                fill="#71717a"
              >
                {p.label}
              </text>
              {/* 점 */}
              <circle
                cx={p.x}
                cy={p.y}
                r={isLast ? 5 : 4}
                fill={isLast ? "#2563eb" : "#93c5fd"}
                stroke="white"
                strokeWidth={1.5}
              />
              {/* 값 */}
              <text
                x={p.x}
                y={clampedLabelY}
                textAnchor="middle"
                fontSize={10}
                fontWeight={isLast ? "700" : "400"}
                fill={isLast ? "#2563eb" : "#60a5fa"}
              >
                {p.v!.toFixed(3)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 해석 */}
      {!isEmpty && (
        <div className="flex flex-wrap gap-3 text-xs text-zinc-500 pt-1 border-t border-zinc-100">
          <span>최근 {valid[valid.length - 1]!.toFixed(3)}</span>
          {valid.length >= 2 && (
            <span className={
              valid[valid.length - 1]! > valid[valid.length - 2]!
                ? "text-blue-600"
                : valid[valid.length - 1]! < valid[valid.length - 2]!
                ? "text-red-500"
                : "text-zinc-400"
            }>
              {valid[valid.length - 1]! > valid[valid.length - 2]! ? "▲ 상승" :
               valid[valid.length - 1]! < valid[valid.length - 2]! ? "▼ 하락" : "── 변화 없음"}
              {" "}({(valid[valid.length - 1]! - valid[valid.length - 2]!).toFixed(3)})
            </span>
          )}
          <span className="text-zinc-400">|0.5| 이상이면 W가 잘 작동하는 수준</span>
        </div>
      )}
    </div>
  );
}
