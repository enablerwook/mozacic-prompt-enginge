"use client";

import { useState } from "react";

type Props = {
  baseLabel?: string;
  newLabel?: string;
  basePrompt: string;
  newPrompt: string;
};

export default function PromptDiffView({
  baseLabel = "현재 W (Base Prompt)",
  newLabel = "수정된 W (New Prompt)",
  basePrompt,
  newPrompt,
}: Props) {
  const [copiedBase, setCopiedBase] = useState(false);
  const [copiedNew, setCopiedNew] = useState(false);

  const baseLines = basePrompt.split("\n");
  const newLines = newPrompt.split("\n");
  const maxLen = Math.max(baseLines.length, newLines.length);

  async function copyBaseW() {
    try {
      await navigator.clipboard.writeText(basePrompt);
      setCopiedBase(true);
      window.setTimeout(() => setCopiedBase(false), 2000);
    } catch {
      setCopiedBase(false);
    }
  }

  async function copyNewW() {
    try {
      await navigator.clipboard.writeText(newPrompt);
      setCopiedNew(true);
      window.setTimeout(() => setCopiedNew(false), 2000);
    } catch {
      setCopiedNew(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">W 전·후 비교</h2>
      <p className="mb-4 text-xs text-zinc-600">나란히 배치된 Diff 스타일 미리보기 (실제 diff 알고리즘 없음)</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-h-[220px] flex-col rounded-xl border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-700">{baseLabel}</span>
            <button type="button" className="btn py-1 text-xs" onClick={() => void copyBaseW()}>
              {copiedBase ? "복사됨 ✓" : "현재 W 복사"}
            </button>
          </div>
          <pre className="font-mono-ui flex-1 overflow-auto p-3 text-[13px] leading-relaxed text-zinc-800 whitespace-pre-wrap">
            {basePrompt}
          </pre>
        </div>
        <div className="flex min-h-[220px] flex-col rounded-xl border border-blue-200 bg-blue-50/40">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">{newLabel}</span>
            <button type="button" className="btn py-1 text-xs" onClick={() => void copyNewW()}>
              {copiedNew ? "복사됨 ✓" : "수정 W 복사"}
            </button>
          </div>
          <pre className="font-mono-ui flex-1 overflow-auto p-3 text-[13px] leading-relaxed text-zinc-800 whitespace-pre-wrap">
            {newPrompt}
          </pre>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <p className="mb-2 text-xs font-medium text-zinc-600">줄 단위 하이라이트 (간단 비교)</p>
        <div className="max-h-48 space-y-1 overflow-auto font-mono-ui text-[12px]">
          {Array.from({ length: maxLen }, (_, i) => {
            const b = baseLines[i] ?? "";
            const n = newLines[i] ?? "";
            const same = b === n;
            return (
              <div
                key={i}
                className={`grid grid-cols-1 gap-1 rounded-md px-2 py-1 sm:grid-cols-2 ${
                  same ? "bg-transparent" : "bg-zinc-100"
                }`}
              >
                <span className={`break-all ${same ? "text-zinc-600" : "text-zinc-800"}`}>
                  <span className="mr-2 text-zinc-500">{String(i + 1).padStart(2, "0")}</span>
                  {b || "—"}
                </span>
                <span className={`break-all ${same ? "text-zinc-600" : "text-blue-800"}`}>
                  <span className="mr-2 text-zinc-500">{String(i + 1).padStart(2, "0")}</span>
                  {n || "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
