"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MockDataTable from "@/components/optimize/MockDataTable";
import PromptDiffView from "@/components/optimize/PromptDiffView";
import { MOCK_BASE_W, MOCK_NEW_W, type MockMozaicRow } from "@/lib/mockMozaicData";
import {
  buildOptimizeHistoryLine,
  DEFAULT_OPTIMIZE_FIELDS,
  type OptimizeContextField,
  type HookScoreEntry,
} from "@/lib/optimizeFields";
import { pearsonCorrelation } from "@/lib/stats";
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
  const [geminiVersion, setGeminiVersion] = useState<"gemini-2.5-flash" | "gemini-2.0-flash" | "gemini-1.5-pro" | "gemini-1.5-flash">("gemini-2.5-flash");
  const [repeatCount, setRepeatCount] = useState(1);
  const abortRef = useRef<AbortController | null>(null);
  const [currentRound, setCurrentRound] = useState<number | null>(null);
  const [scoreProgress, setScoreProgress] = useState<{ current: number; total: number } | null>(null);
  const [runMeta, setRunMeta] = useState<{
    ai: string;
    dataCount: number;
    rounds: number;
    fieldCount: number;
    hookCorr: number | null;
    ranAt: string;
  } | null>(null);
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

  const targetRows = useMemo(
    () => (selectedIds.size > 0 ? rows.filter((r) => selectedIds.has(r.id)) : rows),
    [rows, selectedIds]
  );

  const stats = useMemo(() => {
    const base = targetRows.length > 0 ? targetRows : rows;
    const withPerf = base.filter((r) => r.views > 0).length;
    const likeRatios = base.map((r) => (r.views > 0 ? (r.likes / r.views) * 100 : 0));
    const viewCounts = base.map((r) => r.views);
    const corr = pearsonCorrelation(likeRatios, viewCounts);
    const fieldCount = Object.values(optimizeFields).filter(Boolean).length;
    return { total: base.length, withPerf, corr, fieldCount };
  }, [targetRows, rows, optimizeFields]);

  async function runOptimize() {
    if (rows.length < 2) return;
    setLoading(true);
    setMessage("");
    setResult(null);
    setRunMeta(null);
    setScoreProgress(null);

    const abort = new AbortController();
    abortRef.current = abort;

    const rounds = Math.max(1, Math.min(repeatCount, 10));
    let iterW = currentW.trim() || null;

    // ── Phase 1: 각 영상을 현재 W로 실제 채점 ──────────────────────
    const scoreMap = new Map<string, HookScoreEntry>();
    setScoreProgress({ current: 0, total: targetRows.length });

    for (let i = 0; i < targetRows.length; i++) {
      if (abort.signal.aborted) break;
      const row = targetRows[i];
      setScoreProgress({ current: i + 1, total: targetRows.length });
      try {
        const scoreText = [row.title, row.description].filter(Boolean).join(" | ");
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            text: scoreText,
            views: row.views,
            likes: row.likes,
            systemPrompt: iterW ?? undefined,
          }),
        });
        if (res.ok) {
          const d = await res.json() as { score?: number; verdict?: string };
          if (typeof d.score === "number") {
            scoreMap.set(row.id, { score: d.score, verdict: d.verdict ?? "-" });
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") break;
        // 채점 실패 시 해당 행은 "-"로 유지
      }
    }
    setScoreProgress(null);

    if (abort.signal.aborted) {
      setLoading(false);
      setMessage("중지되었습니다.");
      return;
    }

    // ── Phase 2: 실제 훅점수 ↔ 조회수 상관계수 계산 ────────────────
    const scoredRows = targetRows.filter((r) => scoreMap.has(r.id));
    const hookScores = scoredRows.map((r) => scoreMap.get(r.id)!.score);
    const viewCounts = scoredRows.map((r) => r.views);
    const hookCorr = scoredRows.length >= 2
      ? pearsonCorrelation(hookScores, viewCounts)
      : null;

    // ── Phase 3: 실제 점수 포함한 히스토리 → 최적화 AI 호출 ────────
    const historyLines = targetRows.map((r) =>
      buildOptimizeHistoryLine(r, optimizeFields, asOfHistory, scoreMap)
    );
    let lastResult: OptimizeResult | null = null;

    for (let i = 1; i <= rounds; i++) {
      if (abort.signal.aborted) break;
      setCurrentRound(i);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          mode: "optimize",
          ai: aiModel,
          geminiVersion,
          payload: {
            correlation: hookCorr ?? stats.corr,
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
    setRunMeta({
      ai: aiModel,
      dataCount: targetRows.length,
      rounds,
      fieldCount: stats.fieldCount,
      hookCorr,
      ranAt: new Date().toLocaleString("ko-KR"),
    });
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

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* AI 선택 */}
          <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-sm font-medium">
            {(["claude", "gemini"] as const).map((m, idx) => (
              <button
                key={m}
                type="button"
                onClick={() => setAiModel(m)}
                className={`px-4 py-2 transition ${idx > 0 ? "border-l border-zinc-200" : ""} ${
                  aiModel === m ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {m === "claude" ? "Claude" : "Gemini"}
              </button>
            ))}
          </div>

          {/* 반복 회차 */}
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <label htmlFor="repeat-count">반복</label>
            <input
              id="repeat-count"
              type="number"
              min={1}
              max={10}
              value={repeatCount}
              onChange={(e) => setRepeatCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="input w-14 text-center text-sm"
            />
            <span className="text-zinc-400">회</span>
          </div>

          {/* 실행 / 중지 버튼 */}
          {loading ? (
            <button
              type="button"
              className="btn bg-red-600 text-white hover:bg-red-700 border-red-600"
              onClick={() => abortRef.current?.abort()}
            >
              ■ 중지
            </button>
          ) : (
            <button className="btn" onClick={runOptimize} disabled={rows.length < 2}>
              ⚡ W 최적화 실행
            </button>
          )}
        </div>

        {/* Gemini 버전 선택 (gemini 선택 시만 표시) */}
        {aiModel === "gemini" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Gemini 버전</span>
            <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-xs font-medium">
              {(["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"] as const).map((v, idx) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setGeminiVersion(v)}
                  className={`px-3 py-1.5 transition ${idx > 0 ? "border-l border-zinc-200" : ""} ${
                    geminiVersion === v ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {v.replace("gemini-", "")}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 통계 카드 */}
        <div className="grid gap-3 md:grid-cols-4">
          <div className="card p-4">
            <p className="text-xs text-zinc-500">분석 데이터 수</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{stats.total}</p>
            {selectedIds.size > 0 && (
              <p className="text-xs text-blue-600">선택 {selectedIds.size} / 전체 {rows.length}</p>
            )}
          </div>
          <div className="card p-4">
            <p className="text-xs text-zinc-500">성과 입력 수</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{stats.withPerf}</p>
            <p className="text-xs text-zinc-400">조회수 &gt; 0</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-zinc-500">상관계수</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">
              {stats.corr === null ? "—" : stats.corr.toFixed(3)}
            </p>
            <p className="text-xs text-zinc-400">좋아요율 ↔ 조회수</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-zinc-500">포함 필드 수</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{stats.fieldCount}</p>
            <p className="text-xs text-zinc-400">체크된 항목</p>
          </div>
        </div>
      </div>

      {loading && scoreProgress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>W로 각 영상 채점 중 — {scoreProgress.current}/{scoreProgress.total}건</span>
            <span>{Math.round((scoreProgress.current / scoreProgress.total) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-150"
              style={{ width: `${Math.round((scoreProgress.current / scoreProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {result && (
        <section className="card space-y-3 border border-blue-200 bg-blue-50/30 p-5">
          <h3 className="text-lg font-semibold text-zinc-900">W 진단 결과</h3>
          {runMeta && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-white font-medium">
                {runMeta.ai === "gemini" ? "Gemini" : "Claude"}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600">
                데이터 {runMeta.dataCount}건
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600">
                {runMeta.rounds}회차
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600">
                필드 {runMeta.fieldCount}개
              </span>
              {runMeta.hookCorr !== null && (
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700 font-mono-ui">
                  훅점수 상관계수 {runMeta.hookCorr.toFixed(3)}
                </span>
              )}
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-400">
                {runMeta.ranAt}
              </span>
            </div>
          )}
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
