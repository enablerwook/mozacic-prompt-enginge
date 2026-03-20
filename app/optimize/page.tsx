"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function OptimizePage() {
  const router = useRouter();
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [message, setMessage] = useState("");

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
          historyLines: rows.map((r) => {
            const parsed = parseGroundTruth(r.ground_truth);
            return `영상: ${r.description ?? "-"} | 훅점수: ${
              parsed?.score ?? "-"
            } | 조회수: ${r.views ?? "-"} | 판정: ${parsed?.verdict ?? "-"}`;
          }),
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
        <div className="card p-4 text-[#e0e0e0]">분석 데이터 수: {stats.total}</div>
        <div className="card p-4 text-[#e0e0e0]">성과 입력 수: {stats.withPerf}</div>
        <div className="card p-4 text-[#e0e0e0]">
          상관계수: {stats.corr === null ? "-" : stats.corr.toFixed(3)}
        </div>
        <div className="card p-4 text-[#e0e0e0]">하위요소 수: {stats.subCount}</div>
      </section>

      <section className="card p-5 text-sm text-[#b0b0b0]">
        상태: {correlationLabel(stats.corr)}
      </section>

      <section className="card overflow-x-auto p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">히스토리 요약</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-[#b0b0b0]">
            <tr>
              <th>텍스트</th>
              <th>점수</th>
              <th>조회수</th>
              <th>판정</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((r) => (
              <tr key={r.id} className="border-t border-[#1a1a2e] text-[#e0e0e0]">
                <td className="max-w-lg truncate py-2">{r.description}</td>
                <td>{parseGroundTruth(r.ground_truth)?.score ?? "-"}</td>
                <td>{r.views ?? "-"}</td>
                <td>{parseGroundTruth(r.ground_truth)?.verdict ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <button className="btn" onClick={runOptimize} disabled={loading || rows.length < 2}>
        {loading ? "최적화 중..." : "⚡ W 최적화 실행"}
      </button>

      {result && (
        <section className="card space-y-3 border border-[#00ff88]/50 p-5 shadow-[0_0_24px_rgba(0,255,136,0.25)]">
          <h3 className="text-lg font-bold text-[#00ff88]">W 진단 결과</h3>
          <p className="text-sm text-[#b0b0b0]">프롬프트 문제점</p>
          <p className="text-sm text-[#e0e0e0]">{result.diagnosis}</p>
          <p className="text-sm text-[#b0b0b0]">예측 실패 항목</p>
          <p className="text-sm text-[#e0e0e0]">{result.weak_items}</p>
          <p className="text-sm text-[#b0b0b0]">놓친 요소</p>
          <p className="text-sm text-[#e0e0e0]">{result.missing_factors}</p>
          <p className="text-sm text-[#b0b0b0]">가중치 조정</p>
          <p className="text-sm text-[#e0e0e0]">{result.weight_suggestion}</p>
          <p className="text-sm text-[#b0b0b0]">최적화된 프롬프트 (W1)</p>
          <textarea
            className="input min-h-56 border-[#00ff88]/50 bg-[#082015] text-[#d9ffe9]"
            readOnly
            value={result.prompt}
          />
          <p className="text-sm text-[#b0b0b0]">변경사항</p>
          <p className="text-sm text-[#e0e0e0]">{result.changes}</p>
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

      {message && <p className="text-sm text-red-300">{message}</p>}
    </div>
  );
}
