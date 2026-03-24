"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import AutopilotProgress from "@/components/optimize/AutopilotProgress";
import MockDataTable from "@/components/optimize/MockDataTable";
import PromptDiffView from "@/components/optimize/PromptDiffView";
import { MOCK_BASE_W, MOCK_NEW_W } from "@/lib/mockMozaicData";
import {
  buildOptimizeHistoryLine,
  DEFAULT_OPTIMIZE_FIELDS,
  type OptimizeContextField,
} from "@/lib/optimizeFields";
import { supabase } from "@/lib/supabase";
import { correlationLabel, pearsonCorrelation } from "@/lib/stats";
import { W_PROMPT_STORAGE_KEY, W_VERSION_STORAGE_KEY } from "@/lib/wPrompt";
import { AnalyzeResult, DatasetRow, OptimizeResult } from "@/types";

function parseGroundTruth(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as AnalyzeResult;
  } catch {
    return null;
  }
}

function subscribeStoredW(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getStoredW() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(W_PROMPT_STORAGE_KEY) ?? "";
}

export default function OptimizePage() {
  const router = useRouter();
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [message, setMessage] = useState("");
  const storedW = useSyncExternalStore(subscribeStoredW, getStoredW, () => "");
  const [asOfHistory] = useState(() => new Date());
  const [optimizeFields, setOptimizeFields] = useState<Record<OptimizeContextField, boolean>>(
    () => ({ ...DEFAULT_OPTIMIZE_FIELDS })
  );

  function setOptimizeField(key: OptimizeContextField, value: boolean) {
    setOptimizeFields((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("datasets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        setMessage(error.message);
        return;
      }
      setRows((data ?? []) as DatasetRow[]);
    }
    void load();
  }, []);

  const basePromptForDiff = storedW.trim() ? storedW : MOCK_BASE_W;
  const newPromptForDiff = result?.prompt?.trim() ? result.prompt : MOCK_NEW_W;

  const stats = useMemo(() => {
    const withPerf = rows.filter(
      (r) => typeof r.views === "number" || typeof r.likes === "number" || typeof r.comments === "number"
    ).length;
    const withScore = rows.filter(
      (r) =>
        typeof parseGroundTruth(r.ground_truth)?.score === "number" &&
        typeof r.views === "number"
    );
    const corr = pearsonCorrelation(
      withScore.map((r) => Number(parseGroundTruth(r.ground_truth)?.score ?? 0)),
      withScore.map((r) => Number(r.views))
    );
    return { total: rows.length, withPerf, corr, subCount: 9 };
  }, [rows]);

  async function runOptimize() {
    if (rows.length < 2) return;
    setLoading(true);
    setMessage("");

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "optimize",
        payload: {
          correlation: stats.corr,
          historyLines: rows.map((r) => buildOptimizeHistoryLine(r, optimizeFields, asOfHistory)),
        },
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "최적화 실패");
      return;
    }
    setResult(data as OptimizeResult);
  }

  function applyOptimizedPrompt() {
    if (!result || typeof window === "undefined") return;
    const currentVersion = Number(localStorage.getItem(W_VERSION_STORAGE_KEY) ?? "0");
    const nextVersion = Number.isNaN(currentVersion) ? 1 : currentVersion + 1;
    localStorage.setItem(W_PROMPT_STORAGE_KEY, result.prompt);
    localStorage.setItem(W_VERSION_STORAGE_KEY, String(nextVersion));
    router.push("/analyze");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="grid gap-3 md:grid-cols-4">
        <div className="card p-4 text-zinc-800">분석 데이터 수: {stats.total}</div>
        <div className="card p-4 text-zinc-800">성과 입력 수: {stats.withPerf}</div>
        <div className="card p-4 text-zinc-800">
          상관계수: {stats.corr === null ? "-" : stats.corr.toFixed(3)}
        </div>
        <div className="card p-4 text-zinc-800">하위요소 수: {stats.subCount}</div>
      </section>

      <MockDataTable
        showOptimizeFieldToggles
        optimizeFieldInclude={optimizeFields}
        onOptimizeFieldIncludeChange={setOptimizeField}
      />

      <section className="card p-5 text-sm text-zinc-600">
        상태: {correlationLabel(stats.corr)}
      </section>

      <button className="btn" onClick={runOptimize} disabled={loading || rows.length < 2}>
        {loading ? "최적화 중..." : "⚡ W 최적화 실행"}
      </button>

      {result && (
        <section className="card space-y-3 border border-blue-200 bg-blue-50/30 p-5">
          <h3 className="text-lg font-semibold text-zinc-900">W 진단 결과</h3>
          <p className="text-sm text-zinc-600">프롬프트 문제점</p>
          <p className="text-sm text-zinc-800">{result.diagnosis}</p>
          <p className="text-sm text-zinc-600">예측 실패 항목</p>
          <p className="text-sm text-zinc-800">{result.weak_items}</p>
          <p className="text-sm text-zinc-600">놓친 요소</p>
          <p className="text-sm text-zinc-800">{result.missing_factors}</p>
          <p className="text-sm text-zinc-600">가중치 조정</p>
          <p className="text-sm text-zinc-800">{result.weight_suggestion}</p>
          <p className="text-sm text-zinc-600">최적화된 프롬프트 (W1)</p>
          <textarea className="input min-h-56" readOnly value={result.prompt} />
          <p className="text-sm text-zinc-600">변경사항</p>
          <p className="text-sm text-zinc-800">{result.changes}</p>
          <button
            className="btn"
            onClick={() => navigator.clipboard.writeText(result.prompt)}
          >
            복사
          </button>
          <button className="btn" onClick={applyOptimizedPrompt}>
            이 W를 분석에 적용
          </button>
        </section>
      )}

      {message && <p className="text-sm text-red-600">{message}</p>}

      <AutopilotProgress />

      <PromptDiffView basePrompt={basePromptForDiff} newPrompt={newPromptForDiff} />
    </div>
  );
}
