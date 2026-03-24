"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MockDataTable from "@/components/optimize/MockDataTable";
import PromptDiffView from "@/components/optimize/PromptDiffView";
import CorrChart from "@/components/optimize/CorrChart";
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
  const [fastScoring, setFastScoring] = useState(true); // Haiku / gemini-2.0-flash for scoring
  const [repeatCount, setRepeatCount] = useState(1);
  const abortRef = useRef<AbortController | null>(null);
  // 캐시: wPromptKey → Map<rowId, HookScoreEntry>
  const scoreCacheRef = useRef<Map<string, Map<string, HookScoreEntry>>>(new Map());
  const [totalProgress, setTotalProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [hookCorrHistory, setHookCorrHistory] = useState<(number | null)[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiParticles, setConfettiParticles] = useState<Array<{
    id: number; left: number; delay: number; duration: number; color: string; width: number; height: number;
  }>>([]);
  const prevResultRef = useRef<OptimizeResult | null>(null);
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
    const stored = localStorage.getItem(W_PROMPT_STORAGE_KEY);
    setCurrentW(stored?.trim() ? stored : ANALYSIS_SYSTEM_PROMPT);
    void loadSavedPrompts().then(setSavedPrompts);
  }, []);

  const CONFETTI_COLORS = ["#ff6b6b","#feca57","#48dbfb","#ff9ff3","#54a0ff","#5f27cd","#00d2d3","#ff9f43","#1dd1a1","#ee5a24"];

  useEffect(() => {
    if (!result || result === prevResultRef.current) return;
    prevResultRef.current = result;
    const particles = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 98,
      delay: Math.random() * 0.6,
      duration: 1.3 + Math.random() * 0.7,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      width: 6 + Math.floor(Math.random() * 7),
      height: 4 + Math.floor(Math.random() * 5),
    }));
    setConfettiParticles(particles);
    setShowConfetti(true);
    const t = setTimeout(() => setShowConfetti(false), 2000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

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

  const handleSavePrompt = useCallback(async () => {
    if (!currentW.trim()) return;
    const next = await savePrompt(saveNameInput, currentW);
    setSavedPrompts(next);
    setSaveNameInput("");
    setShowSaved(true);
  }, [currentW, saveNameInput]);

  const handleDeletePrompt = useCallback(async (id: string) => {
    setSavedPrompts(await deletePrompt(id));
  }, []);

  const handleRenamePrompt = useCallback(async (id: string, newName: string) => {
    setSavedPrompts(await renamePrompt(id, newName));
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

  async function scoreRows(
    rowsToScore: typeof targetRows,
    wPrompt: string | null,
    abort: AbortController,
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, HookScoreEntry>> {
    const BATCH_SIZE = 20;
    const MAX_PARALLEL = 5;
    const scoringModel = fastScoring
      ? (aiModel === "gemini" ? "gemini-2.0-flash" : "haiku")
      : undefined;

    const wCacheKey = (wPrompt ?? "default").slice(0, 200);
    const cached = scoreCacheRef.current.get(wCacheKey) ?? new Map<string, HookScoreEntry>();
    const scoreMap = new Map<string, HookScoreEntry>(cached);
    const uncachedRows = rowsToScore.filter((r) => !cached.has(r.id));

    if (uncachedRows.length > 0) {
      const batches: (typeof uncachedRows)[] = [];
      for (let i = 0; i < uncachedRows.length; i += BATCH_SIZE) {
        batches.push(uncachedRows.slice(i, i + BATCH_SIZE));
      }
      onProgress?.(cached.size, rowsToScore.length);

      let scoredCount = cached.size;
      for (let bi = 0; bi < batches.length; bi += MAX_PARALLEL) {
        if (abort.signal.aborted) break;
        const chunk = batches.slice(bi, bi + MAX_PARALLEL);
        await Promise.all(
          chunk.map(async (batch) => {
            if (abort.signal.aborted) return;
            try {
              const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "content-type": "application/json" },
                signal: abort.signal,
                body: JSON.stringify({
                  mode: "batch-score",
                  ai: aiModel,
                  geminiVersion,
                  scoringModel,
                  payload: {
                    systemPrompt: wPrompt ?? undefined,
                    rows: batch.map((r) => ({
                      id: r.id,
                      text: [r.title, r.description].filter(Boolean).join(" | "),
                      views: r.views,
                      likes: r.likes,
                    })),
                  },
                }),
              });
              if (res.ok) {
                const results = await res.json() as Array<{ id: string; score?: number; verdict?: string }>;
                for (const d of results) {
                  if (typeof d.score === "number") {
                    scoreMap.set(d.id, { score: d.score, verdict: d.verdict ?? "-" });
                  }
                }
              }
            } catch (e) {
              if ((e as Error).name === "AbortError") return;
            }
            scoredCount += batch.length;
            onProgress?.(Math.min(scoredCount, rowsToScore.length), rowsToScore.length);
          })
        );
      }
      scoreCacheRef.current.set(wCacheKey, new Map(scoreMap));
    }

    onProgress?.(rowsToScore.length, rowsToScore.length);
    return scoreMap;
  }

  async function runOptimize() {
    if (rows.length < 2) return;
    setLoading(true);
    setMessage("");
    setResult(null);
    setRunMeta(null);
    setTotalProgress(null);
    setHookCorrHistory([]);

    const abort = new AbortController();
    abortRef.current = abort;

    const rounds = Math.max(1, Math.min(repeatCount, 10));
    // Total steps: each round has (targetRows.length scoring steps) + 1 optimization step
    const totalSteps = rounds * (targetRows.length + 1);
    let completedSteps = 0;

    let iterW = currentW.trim() || null;
    let lastResult: OptimizeResult | null = null;
    let lastHookCorr: number | null = null;

    try {
      for (let i = 1; i <= rounds; i++) {
        if (abort.signal.aborted) break;

        // ── 채점: 현재 iterW로 모든 행 채점 ────────────────────────
        const baseForRound = completedSteps;
        setTotalProgress({ current: baseForRound, total: totalSteps, label: `${i}/${rounds}회차 채점 중` });
        const scoreMap = await scoreRows(
          targetRows, iterW, abort,
          (scored) => {
            setTotalProgress({
              current: baseForRound + scored,
              total: totalSteps,
              label: `${i}/${rounds}회차 채점 중 — ${scored}/${targetRows.length}건`,
            });
          }
        );
        if (abort.signal.aborted) break;
        completedSteps += targetRows.length;

        // ── 상관계수 계산 ───────────────────────────────────────────
        const scoredRows = targetRows.filter((r) => scoreMap.has(r.id));
        const hookScores = scoredRows.map((r) => scoreMap.get(r.id)!.score);
        const viewCounts = scoredRows.map((r) => r.views);
        lastHookCorr = scoredRows.length >= 2
          ? pearsonCorrelation(hookScores, viewCounts)
          : null;
        setHookCorrHistory((prev) => [...prev, lastHookCorr]);

        // ── 최적화: 채점 결과로 W 개선 ─────────────────────────────
        setTotalProgress({ current: completedSteps, total: totalSteps, label: `${i}/${rounds}회차 최적화 중…` });

        // 502 방지: historyLines를 최대 40행으로 제한 (판별력 높은 행 우선)
        const MAX_HISTORY_ROWS = 40;
        let historyRows = targetRows;
        if (targetRows.length > MAX_HISTORY_ROWS) {
          const sortedByScore = [...targetRows].sort(
            (a, b) => (scoreMap.get(b.id)?.score ?? 0) - (scoreMap.get(a.id)?.score ?? 0)
          );
          const sortedByViews = [...targetRows].sort((a, b) => b.views - a.views);
          const scoreRank = new Map(sortedByScore.map((r, idx) => [r.id, idx]));
          const viewsRank = new Map(sortedByViews.map((r, idx) => [r.id, idx]));
          historyRows = [...targetRows]
            .sort(
              (a, b) =>
                Math.abs((scoreRank.get(b.id) ?? 0) - (viewsRank.get(b.id) ?? 0)) -
                Math.abs((scoreRank.get(a.id) ?? 0) - (viewsRank.get(a.id) ?? 0))
            )
            .slice(0, MAX_HISTORY_ROWS);
        }
        const historyLines = historyRows.map((r) =>
          buildOptimizeHistoryLine(r, optimizeFields, asOfHistory, scoreMap)
        );

        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: abort.signal,
          body: JSON.stringify({
            mode: "optimize",
            ai: aiModel,
            geminiVersion,
            payload: {
              correlation: lastHookCorr ?? stats.corr,
              currentW: iterW,
              historyLines,
            },
          }),
        });
        const data = await res.json() as OptimizeResult & { error?: string };
        if (!res.ok) {
          // 이 회차는 실패 — 에러를 메시지에 기록하고 다음 회차로 계속
          setMessage(`${i}회차 최적화 실패: ${data.error ?? "알 수 없는 오류"}`);
          completedSteps += 1;
          setTotalProgress({ current: completedSteps, total: totalSteps, label: `${i}/${rounds}회차 실패 (건너뜀)` });
          continue;
        }
        lastResult = data;
        iterW = lastResult.prompt?.trim() || iterW;
        completedSteps += 1;
        setTotalProgress({ current: completedSteps, total: totalSteps, label: `${i}/${rounds}회차 완료` });
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessage((e as Error).message || "알 수 없는 오류");
      }
    } finally {
      setLoading(false);
      setTotalProgress(null);
    }

    if (abort.signal.aborted) {
      setMessage("중지되었습니다.");
    } else if (lastResult) {
      setResult(lastResult);
      setRunMeta({
        ai: aiModel,
        dataCount: targetRows.length,
        rounds,
        fieldCount: stats.fieldCount,
        hookCorr: lastHookCorr,
        ranAt: new Date().toLocaleString("ko-KR"),
      });
    }
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
      {/* 폭죽 오버레이 */}
      {showConfetti && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {confettiParticles.map((p) => (
            <div
              key={p.id}
              style={{
                position: "absolute",
                left: `${p.left}%`,
                top: "-12px",
                width: `${p.width}px`,
                height: `${p.height}px`,
                backgroundColor: p.color,
                borderRadius: "2px",
                animation: `confetti-fall ${p.duration}s ${p.delay}s ease-in both`,
              }}
            />
          ))}
        </div>
      )}
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
            onKeyDown={(e) => { if (e.key === "Enter") void handleSavePrompt(); }}
          />
          <button
            type="button"
            className="btn text-sm"
            onClick={() => void handleSavePrompt()}
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

        {/* 채점 속도 토글 */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              className="checkbox-mozaic checkbox-mozaic-sm"
              checked={fastScoring}
              onChange={(e) => setFastScoring(e.target.checked)}
            />
            채점 속도 우선
            <span className="text-xs text-zinc-400">
              ({aiModel === "gemini" ? "gemini-2.0-flash" : "claude-haiku"} 사용)
            </span>
          </label>
        </div>

        {/* Gemini 버전 선택 (gemini 선택 시만 표시) */}
        {aiModel === "gemini" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Gemini 버전 (최적화)</span>
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
            <p className="text-xs text-zinc-500">훅점수 상관계수</p>
            {(() => {
              const latest = hookCorrHistory.length > 0
                ? hookCorrHistory[hookCorrHistory.length - 1]
                : null;
              return (
                <>
                  <p className={`mt-1 text-xl font-semibold ${latest != null ? "text-zinc-900" : "text-zinc-400"}`}>
                    {latest != null ? latest.toFixed(3) : "—"}
                  </p>
                  <p className="text-xs text-zinc-400">훅점수 ↔ 조회수</p>
                  <p className="mt-1.5 text-xs text-zinc-400 border-t border-zinc-100 pt-1.5">
                    기준선 {stats.corr !== null ? stats.corr.toFixed(3) : "—"}
                    <span className="ml-1 text-zinc-300">(좋아요율↔조회수)</span>
                  </p>
                </>
              );
            })()}
          </div>
          <div className="card p-4">
            <p className="text-xs text-zinc-500">포함 필드 수</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{stats.fieldCount}</p>
            <p className="text-xs text-zinc-400">체크된 항목</p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {totalProgress?.label ?? "준비 중…"}
              {fastScoring && totalProgress?.label?.includes("채점") && (
                <span className="ml-1 text-blue-500">({aiModel === "gemini" ? "2.0-flash" : "Haiku"})</span>
              )}
            </span>
            <span>
              {totalProgress && totalProgress.total > 0
                ? `${Math.round((totalProgress.current / totalProgress.total) * 100)}%`
                : ""}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200">
            {totalProgress && totalProgress.total > 0 ? (
              <div
                className="h-full rounded-full bg-blue-500 transition-[width] duration-150"
                style={{ width: `${Math.round((totalProgress.current / totalProgress.total) * 100)}%` }}
              />
            ) : (
              <div className="h-full w-full animate-pulse rounded-full bg-blue-300" />
            )}
          </div>
        </div>
      )}

      {(hookCorrHistory.length > 0 || loading) && (
        <CorrChart history={hookCorrHistory} loading={loading} />
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
