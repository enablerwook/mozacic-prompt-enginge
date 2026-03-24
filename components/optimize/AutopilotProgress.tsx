"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PRESETS = [10, 30, 50, 100] as const;

export default function AutopilotProgress() {
  const [target, setTarget] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
  }, []);

  const start = useCallback(
    (n: number) => {
      stop();
      setTarget(n);
      setCurrent(0);
      setRunning(true);
      timerRef.current = setInterval(() => {
        setCurrent((c) => {
          const next = c + 1;
          if (next >= n) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            setRunning(false);
            return n;
          }
          return next;
        });
      }, 120);
    },
    [stop]
  );

  useEffect(() => () => stop(), [stop]);

  const pct = target && target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">자동 최적화 (시뮬레이션)</h2>
      <p className="mb-4 text-xs text-zinc-600">
        API 없이 <code className="font-mono-ui text-blue-600">setInterval</code>로 진행률만 연출합니다.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            className="btn disabled:opacity-40"
            disabled={running}
            onClick={() => start(n)}
          >
            {n}회
          </button>
        ))}
        <button
          type="button"
          className="btn border-red-200 text-red-700 hover:bg-red-50"
          onClick={stop}
        >
          중지
        </button>
      </div>

      <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-center justify-between text-sm text-zinc-800">
          <span>
            {target != null ? (
              <>
                <span className="font-mono-ui text-zinc-900">{current}</span>
                <span className="text-zinc-500"> / </span>
                <span className="font-mono-ui">{target}</span>
                <span className="ml-2 text-zinc-600">회 반복 중…</span>
              </>
            ) : (
              <span className="text-zinc-600">실행할 횟수를 선택하세요.</span>
            )}
          </span>
          <span className="text-xs text-zinc-600">{pct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-[width] duration-150 ease-out"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {target != null && current >= target && !running && (
          <p className="text-xs text-zinc-600">시뮬레이션 완료</p>
        )}
      </div>
    </section>
  );
}
