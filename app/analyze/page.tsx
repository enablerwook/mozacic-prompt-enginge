"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import MockDataTable from "@/components/optimize/MockDataTable";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/analyzer";
import { mockMozaicData, type MockMozaicRow } from "@/lib/mockMozaicData";
import {
  toSubscript,
  W_PROMPT_STORAGE_KEY,
  W_VERSION_STORAGE_KEY,
} from "@/lib/wPrompt";
import {
  loadSavedPrompts,
  savePrompt,
  deletePrompt,
  renamePrompt,
  type SavedPrompt,
} from "@/lib/savedPrompts";
import SavedPromptList from "@/components/SavedPromptList";

type MockSimRow = {
  id: string;
  description: string;
  views: number | null;
  score: number;
  verdict: string;
  summary: string;
};

function shorten(text: string, max = 48) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function formatViews(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n);
}

/** 프론트 전용: 행·프롬프트 길이 기준 안정적인 가짜 분석 결과 */
function mockResultForRow(row: MockMozaicRow, prompt: string) {
  const base = row.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const p = prompt.length;
  const score = Number((4.2 + ((base + p) % 45) / 10).toFixed(1));
  const verdict =
    score >= 8 ? "강한 훅" : score >= 6 ? "보통 훅" : score >= 4 ? "약한 훅" : "훅 약함 (시뮬)";
  const summary = `「${shorten(row.description, 32)}」에 대한 Mock 요약 · 프롬프트 ${p}자 기준`;
  return { score, verdict, summary };
}

export default function AnalyzePage() {
  const [manualPrompt, setManualPrompt] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [wVersion, setWVersion] = useState(0);
  const [mounted, setMounted] = useState(false);

  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [saveNameInput, setSaveNameInput] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [simRunning, setSimRunning] = useState(false);
  const [simProgress, setSimProgress] = useState({ current: 0, total: 0 });
  const [mockResults, setMockResults] = useState<MockSimRow[] | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (typeof window === "undefined") return;
      const stored = localStorage.getItem(W_PROMPT_STORAGE_KEY);
      const ver = Number(localStorage.getItem(W_VERSION_STORAGE_KEY) ?? "0");
      if (stored?.trim()) setManualPrompt(stored);
      else setManualPrompt(ANALYSIS_SYSTEM_PROMPT);
      if (!Number.isNaN(ver)) setWVersion(ver);
      setSavedPrompts(loadSavedPrompts());
      setMounted(true);
    });
  }, []);

  const selectedRows = useMemo(
    () => mockMozaicData.filter((r) => selectedIds.has(r.id)),
    [selectedIds]
  );

  function loadStoredW() {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(W_PROMPT_STORAGE_KEY);
    if (stored?.trim()) setManualPrompt(stored);
    const ver = Number(localStorage.getItem(W_VERSION_STORAGE_KEY) ?? "0");
    if (!Number.isNaN(ver)) setWVersion(ver);
  }

  function resetDefaultPrompt() {
    setManualPrompt(ANALYSIS_SYSTEM_PROMPT);
    setWVersion(0);
  }

  const handleSavePrompt = useCallback(() => {
    if (!manualPrompt.trim()) return;
    const next = savePrompt(saveNameInput, manualPrompt);
    setSavedPrompts(next);
    setSaveNameInput("");
    setShowSaved(true);
  }, [manualPrompt, saveNameInput]);

  const handleDeletePrompt = useCallback((id: string) => {
    setSavedPrompts(deletePrompt(id));
  }, []);

  const handleRenamePrompt = useCallback((id: string, newName: string) => {
    setSavedPrompts(renamePrompt(id, newName));
  }, []);

  const handleLoadPrompt = useCallback((p: SavedPrompt) => {
    setManualPrompt(p.prompt);
    setShowSaved(false);
  }, []);

  async function runSimulation() {
    if (!manualPrompt.trim() || selectedRows.length === 0) return;
    setMockResults(null);
    setSimRunning(true);
    const total = selectedRows.length;
    setSimProgress({ current: 0, total });

    const out: MockSimRow[] = [];

    for (let i = 0; i < selectedRows.length; i += 1) {
      const row = selectedRows[i];
      setSimProgress({ current: i + 1, total });
      await new Promise((r) => setTimeout(r, 280));
      const m = mockResultForRow(row, manualPrompt);
      out.push({
        id: row.id,
        description: row.description,
        views: row.views,
        score: m.score,
        verdict: m.verdict,
        summary: m.summary,
      });
    }

    setMockResults(out);
    setSimRunning(false);
  }

  const canRun = manualPrompt.trim().length > 0 && selectedIds.size > 0 && !simRunning;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="card p-5">
        <h1 className="text-2xl font-bold text-zinc-900">단일 테스트</h1>
        <p className="mt-2 text-sm text-zinc-600">
          아래에 <span className="text-zinc-800">분석 프롬프트(W)</span>를 입력하고,{" "}
          <span className="text-zinc-800">최적화 탭과 동일한 Mock 데이터 테이블</span>에서 행을 고른 뒤 실행합니다.
          지금은 API 없이 <span className="text-blue-600">프론트 시뮬레이션</span>만 동작합니다.
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          {mounted ? `참고: 저장된 W 버전 W${toSubscript(wVersion)}` : "로딩 중…"}
        </p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold text-zinc-900">분석 프롬프트 (수동 입력)</h2>
        <p className="text-xs text-zinc-600">
          선택한 행마다 proxy·스크립트·조회수 등이 입력으로 쓰일 때, 이 텍스트가 시스템 프롬프트 역할을 한다고 가정합니다.
        </p>
        <textarea
          className="input min-h-56 resize-y font-mono-ui text-sm leading-relaxed"
          placeholder="여기에 W(시스템 프롬프트) 전체를 붙여 넣으세요."
          value={manualPrompt}
          onChange={(e) => setManualPrompt(e.target.value)}
          spellCheck={false}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn text-sm" onClick={loadStoredW}>
            최적화된 W 불러오기
          </button>
          <button type="button" className="btn text-sm" onClick={resetDefaultPrompt}>
            기본 프롬프트로 초기화
          </button>
        </div>

        {/* 저장 입력 */}
        <div className="flex gap-2 pt-1">
          <input
            className="input flex-1 text-sm"
            placeholder="저장할 이름 (비워두면 자동 생성)"
            value={saveNameInput}
            onChange={(e) => setSaveNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSavePrompt()}
          />
          <button
            type="button"
            className="btn text-sm"
            onClick={handleSavePrompt}
            disabled={!manualPrompt.trim()}
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

        {/* 저장된 프롬프트 목록 */}
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
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        subtitleExtra={
          <p className="mt-2 text-xs text-zinc-600">
            최적화 탭의 Mock 데이터 테이블과 동일한 목록·필터입니다. 체크한 행만 아래 실행에 사용됩니다.
          </p>
        }
        footerSlot={
          <>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" className="btn" disabled={!canRun} onClick={() => void runSimulation()}>
                {simRunning
                  ? `시뮬레이션 중… ${simProgress.current}/${simProgress.total}`
                  : "선택한 DB로 프롬프트 실행 (시뮬레이션)"}
              </button>
              {!manualPrompt.trim() && (
                <span className="text-xs text-zinc-600">프롬프트를 입력해 주세요.</span>
              )}
              {manualPrompt.trim() && selectedIds.size === 0 && (
                <span className="text-xs text-zinc-600">최소 1행을 선택해 주세요.</span>
              )}
            </div>
            {simRunning && simProgress.total > 0 && (
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-[width] duration-200"
                  style={{
                    width: `${Math.round((simProgress.current / simProgress.total) * 100)}%`,
                  }}
                />
              </div>
            )}
          </>
        }
      />

      {mockResults && mockResults.length > 0 && (
        <section className="card space-y-4 p-5">
          <h2 className="text-lg font-semibold text-zinc-900">시뮬레이션 결과</h2>
          <p className="text-xs text-zinc-600">
            실제 API 연동 전 · 선택한 {mockResults.length}건에 대한 가짜 점수·요약입니다.
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-zinc-100 text-zinc-700">
                <tr>
                  <th className="px-3 py-2 font-medium">영상 설명</th>
                  <th className="px-3 py-2 font-medium">조회수</th>
                  <th className="px-3 py-2 font-medium">Mock 점수</th>
                  <th className="px-3 py-2 font-medium">Mock 판정</th>
                  <th className="px-3 py-2 font-medium">요약</th>
                </tr>
              </thead>
              <tbody className="text-zinc-800">
                {mockResults.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-200">
                    <td className="max-w-xs px-3 py-2 align-top">{shorten(r.description, 56)}</td>
                    <td className="whitespace-nowrap px-3 py-2 align-top font-mono-ui">
                      {r.views != null ? formatViews(r.views) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top font-mono-ui text-zinc-900">
                      {r.score}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-top">{r.verdict}</td>
                    <td className="max-w-md px-3 py-2 align-top text-xs text-zinc-600">{r.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
