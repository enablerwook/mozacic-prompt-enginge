interface Props {
  title: string;
  icon: string;
  color: "red" | "purple" | "yellow";
  items: { name: string; value: number; reason: string }[];
}

const colorMap = {
  red: "linear-gradient(90deg,#2563eb,#93c5fd)",
  purple: "linear-gradient(90deg,#475569,#94a3b8)",
  yellow: "linear-gradient(90deg,#0ea5e9,#7dd3fc)",
} as const;

const labelMap: Record<string, string> = {
  threat: "위협감지",
  loss_fear: "손실공포",
  uncertainty: "불확실성",
  physical_attraction: "신체적매력",
  status_resource: "지위/자원",
  social_charm: "사회적매력",
  trigger_speed: "유발속도",
  emotion_clarity: "감정명확성",
  intensity: "강도",
};

export default function ScoreBars({ title, icon, color, items }: Props) {
  return (
    <div className="card p-5">
      <h4 className="mb-4 text-sm font-semibold text-zinc-900">
        <span className="mr-2">{icon}</span>
        {title}
      </h4>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.name}>
            {(() => {
              const safeValue = Number.isFinite(item.value) ? item.value : 0;
              const width = Math.max(0, Math.min(100, safeValue * 10));
              return (
                <>
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-800">
              <span>{labelMap[item.name] ?? item.name}</span>
              <span>{safeValue}</span>
            </div>
            <div className="h-[6px] rounded-full bg-zinc-200">
              <div
                className="h-[6px] rounded-full"
                aria-label={`${item.name}-progress`}
                style={{
                  width: `${width}%`,
                  background: colorMap[color],
                }}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-600">{item.reason}</p>
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
