"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MockDataTable from "@/components/optimize/MockDataTable";
import PromptDiffView from "@/components/optimize/PromptDiffView";
import { MOCK_BASE_W, MOCK_NEW_W, type MockMozaicRow } from "@/lib/mockMozaicData";
import {
  buildOptimizeHistoryLine,
  DEFAULT_OPTIMIZE_FIELDS,
  type OptimizeContextField,
} from "@/lib/optimizeFields";
import { correlationLabel, pearsonCorrelation } from "@/lib/stats";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/analyzer";
import { W_PROMPT_STORAGE_KEY, W_VERSION_STORAGE_KEY } from "@/lib/wPrompt";
import {
  loadSavedPrompts,
  savePrompt,
  deletePrompt,
  renamePrompt,
  type SavedPrompt,
} from "@/lib/savedPrompts";
import SavedPromptList from "@/components/SavedPromptList";
import { OptimizeResult } from "@/types";

export default function OptimizePage() {
  const router = useRouter();
  const [rows, setRows] = useState<MockMozaicRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [message, setMessage] = useState("");
  const [currentW, setCurrentW] = useState("");
  const [saveNameInput, setSaveNameInput] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [aiModel, setAiModel] = useState<"claude" | "gemini">("claude");
  const [repeatCount, setRepeatCount] = useState(1);
  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const [asOfHistory] = useState(() => new Date());
  const [optimizeFields, setOptimizeFields] = useState<Record<OptimizeContextField, boolean>>(
    () => ({ ...DEFAULT_OPTIMIZE_FIELDS })
  );

  function setOptimizeField(key: OptimizeContextField, value: boolean) {
    setOptimizeFields((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    // W 프롬프트 초기 로드
    const stored = localStorage.getItem(W_PROMPT_STORAGE_KEY);
    setCurrentW(stored?.trim() ? stored : ANALYSIS_SYSTEM_PROMPT);
    setSavedPrompts(loadSavedPrompts());
  }, []);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/mozaic-data");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "데이터 로드 실패" }));
        setMessage(err.error ?? "데이터 로드 실패");
        return;
      }
      const data = (await res.json()) as MockMozaicRow[];
      setRows(data);
    }
    void load();
  }, []);

  const handleSavePrompt = useCallback(() => {
    if (!currentW.trim()) return;
    const next = savePrompt(saveNameInput, currentW);
    setSavedPrompts(next);
    setSaveNameInput("");
    setShowSaved(true);
  }, [currentW, saveNameInput]);

  const handleDeletePrompt = useCallback((id: string) => {
    setSavedPrompts(deletePrompt(id));
  }, []);

  const handleRenamePrompt = useCallback((id: string, newName: string) => {
    setSavedPrompts(renamePrompt(id, newName));
  }, []);

  const handleLoadPrompt = useCallback((p: SavedPrompt) => {
    setCurrentW(p.prompt);
    setShowSaved(false);
  }, []);

  const basePromptForDiff = currentW.trim() ? currentW : MOCK_BASE_W;
  const newPromptForDiff = result?.prompt?.trim() ? result.prompt : MOCK_NEW_W;

  const stats = useMemo(() => {
    const withPerf = rows.filter((r) => r.views > 0).length;
    // hook score 미확보 상태 — 좋아요율 vs 조회수 상관관계로 대체
    const likeRatios = rows.map((r) =>
      r.views > 0 ? (r.likes / r.views) * 100 : 0
    );
    const viewCounts = rows.map((r) => r.views);
    const corr = pearsonCorrelation(likeRatios, viewCounts);
    return { total: rows.length, withPerf, corr, subCount: 9 };
  }, [rows]);

  async function runOptimize() {
    if (rows.length < 2) return;
    setLoading(true);
    setMessage("");
    setResult(null);

    const rounds = Math.max(1, Math.min(repeatCount, 10));
    const targetRows = selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : rows;
    const historyLines = targetRows.map((r) => buildOptimizeHistoryLine(r, optimizeFields, asOfHistory));
    let iterW = currentW.trim() || null;
    let lastResult: OptimizeResult | null = null;

    for (let i = 1; i <= rounds; i++) {
      setCurrentRound(i);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "optimize",
          ai: aiModel,
          payload: {
            correlation: stats.corr,
            currentW: iterW,
            historyLines,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "최적화 실패");
        setLoading(false);
        setCurrentRound(null);
        return;
      }
      lastResult = data as OptimizeResult;
      iterW = lastResult.prompt.trim() || iterW;
    }

    setLoading(false);
    setCurrentRound(null);
    setResult(lastResult);
  }

  function applyOptimizedPrompt() {
    if (!result || typeof window === "undefined") return;
    const currentVersion = Number(localStorage.getItem(W_VERSION_STORAGE_KEY) ?? "0");
    const nextVersion = Number.isNaN(currentVersion) ? 1 : currentVersion + 1;
    localStorage.setItem(W_PROMPT_STORAGE_KEY, result.prompt);
    localStorage.setItem(W_VERSION_STORAGE_KEY, String(nextVersion));
    setCurrentW(result.prompt);
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

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold text-zinc-900">현재 W (분석 프롬프트)</h2>
        <p className="text-xs text-zinc-500">
          최적화 실행 시 이 프롬프트를 기준으로 개선안을 생성합니다.
        </p>
        <textarea
          className="input min-h-48 resize-y font-mono-ui text-sm leading-relaxed"
          placeholder="W 프롬프트를 입력하세요."
          value={currentW}
          onChange={(e) => setCurrentW(e.target.value)}
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 text-sm"
            placeholder="저장 이름 (비워두면 자동 생성)"
            value={saveNameInput}
            onChange={(e) => setSaveNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSavePrompt()}
          />
          <button
            type="button"
            className="btn text-sm"
            onClick={handleSavePrompt}
            disabled={!currentW.trim()}
          >
            💾 저장
          </button>
          <button
            type="button"
            className="btn text-sm"
            onClick={() => setShowSaved((v) => !v)}
          >
            📂 목록 {savedPrompts.length > 0 && `(${savedPrompts.length})`}
          </button>
        </div>

        {showSaved && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50">
            <SavedPromptList
              prompts={savedPrompts}
              onLoad={handleLoadPrompt}
              onDelete={handleDeletePrompt}
              onRename={handleRenamePrompt}
            />
          </div>
        )}
      </section>

      <MockDataTable
        rows={rows}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        showOptimizeFieldToggles
        optimizeFieldInclude={optimizeFields}
        onOptimizeFieldIncludeChange={setOptimizeField}
      />

      <section className="card p-5 text-sm text-zinc-600">
        상태: {correlationLabel(stats.corr)}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-sm font-medium">
          <button
            type="button"
            onClick={() => setAiModel("claude")}
            className={`px-4 py-2 transition ${
              aiModel === "claude"
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Claude
          </button>
          <button
            type="button"
            onClick={() => setAiModel("gemini")}
            className={`px-4 py-2 border-l border-zinc-200 transition ${
              aiModel === "gemini"
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Gemini
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <label htmlFor="repeat-count">반복 회차</label>
          <input
            id="repeat-count"
            type="number"
            min={1}
            max={10}
            value={repeatCount}
            onChange={(e) => setRepeatCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            className="input w-16 text-center text-sm"
          />
          <span className="text-zinc-400">회</span>
        </div>
        <button className="btn" onClick={runOptimize} disabled={loading || rows.length < 2}>
          {loading
            ? currentRound !== null
              ? `최적화 중... (${currentRound}/${repeatCount}회차)`
              : "최적화 중..."
            : "⚡ W 최적화 실행"}
        </button>
      </div>

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

      <PromptDiffView basePrompt={basePromptForDiff} newPrompt={newPromptForDiff} />
    </div>
  );
}
