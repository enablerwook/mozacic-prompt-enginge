interface Props {
  title: string;
  icon: string;
  color: "red" | "purple" | "yellow";
  items: { name: string; value: number; reason: string }[];
}

const colorMap = {
  red: "linear-gradient(90deg,#ff3b5c,#ffd3dc)",
  purple: "linear-gradient(90deg,#a855f7,#e9d5ff)",
  yellow: "linear-gradient(90deg,#ffaa00,#ffe7b0)",
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
      <h4 className="mb-4 text-sm font-semibold text-white">
        <span className="mr-2">{icon}</span>
        {title}
      </h4>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.name}>
            <div className="mb-1 flex items-center justify-between text-xs text-[#e0e0e0]">
              <span>{labelMap[item.name] ?? item.name}</span>
              <span>{item.value}</span>
            </div>
            <div className="h-[6px] rounded-full bg-[#23233a]">
              <div
                className="h-[6px] rounded-full"
                aria-label={`${item.name}-progress`}
                style={{
                  width: `${Math.min(100, item.value * 10)}%`,
                  background: colorMap[color],
                }}
              />
            </div>
            <p className="mt-1 text-xs text-[#b0b0b0]">{item.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
