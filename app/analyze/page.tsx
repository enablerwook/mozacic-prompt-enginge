"use client";

import { useEffect, useMemo, useState } from "react";
import ScoreBars from "@/components/ScoreBars";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/analyzer";
import { supabase } from "@/lib/supabase";
import { pearsonCorrelation } from "@/lib/stats";
import {
  toSubscript,
  W_PROMPT_STORAGE_KEY,
  W_VERSION_STORAGE_KEY,
} from "@/lib/wPrompt";
import { AnalyzeResult, DatasetRow } from "@/types";

const EXAMPLES = [
  "카메라가 흔들리며 누군가 '지금 도망가야 해'라고 속삭이는 장면",
  "첫 2초에 전 애인이 결혼 소식을 말하고 주인공이 멈춰서는 장면",
  "월급 통장이 0원이 된 화면을 클로즈업하며 시작",
  "헬스장 입장 직후 모든 시선이 한 사람에게 쏠리는 장면",
  "아이가 갑자기 울음을 멈추고 한 문장을 말하는 장면",
  "면접관이 첫 질문 전에 이력서를 찢는 장면",
];

function shorten(text: string, max = 28) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function verdictByScore(score: number) {
  if (score >= 8) return "강력한 훅";
  if (score >= 6) return "보통 훅";
  if (score >= 3) return "약한 훅";
  return "훅 없음";
}

function parseGroundTruth(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as AnalyzeResult;
  } catch {
    return null;
  }
}

export default function AnalyzePage() {
  const [text, setText] = useState("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [message, setMessage] = useState("");
  const [showReason, setShowReason] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(ANALYSIS_SYSTEM_PROMPT);
  const [wVersion, setWVersion] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reAnalyzing, setReAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [comparison, setComparison] = useState<{
    beforeCorr: number | null;
    afterCorr: number | null;
    changes: Array<{
      id: string;
      description: string;
      before: number | null;
      after: number | null;
      diff: number | null;
      views: number | null;
    }>;
  } | null>(null);

  const subElementCount = useMemo(() => {
    return result?.disc_maps ? result.disc_maps.split(",").length : 0;
  }, [result]);

  useEffect(() => {
    const loadLocalState = () => {
      const storedPrompt = localStorage.getItem(W_PROMPT_STORAGE_KEY);
      const storedVersion = Number(localStorage.getItem(W_VERSION_STORAGE_KEY) ?? "0");
      if (storedPrompt && storedPrompt.trim()) {
        setSystemPrompt(storedPrompt);
      }
      if (!Number.isNaN(storedVersion)) {
        setWVersion(storedVersion);
      }
      setMounted(true);
    };
    loadLocalState();
  }, []);

  useEffect(() => {
    async function loadRows() {
      const { data, error } = await supabase
        .from("datasets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        setMessage(`데이터 로딩 실패: ${error.message}`);
        return;
      }
      setRows((data ?? []) as DatasetRow[]);
    }
    void loadRows();
  }, []);

  function applyPrompt() {
    if (typeof window === "undefined") return;
    localStorage.setItem(W_PROMPT_STORAGE_KEY, systemPrompt);
    localStorage.setItem(W_VERSION_STORAGE_KEY, String(wVersion));
    setMessage(`W${toSubscript(wVersion)} 적용 완료`);
  }

  function restoreDefaultPrompt() {
    if (typeof window === "undefined") return;
    setSystemPrompt(ANALYSIS_SYSTEM_PROMPT);
    setWVersion(0);
    localStorage.setItem(W_PROMPT_STORAGE_KEY, ANALYSIS_SYSTEM_PROMPT);
    localStorage.setItem(W_VERSION_STORAGE_KEY, "0");
    setMessage("기본 프롬프트 W₀로 복원했습니다.");
  }

  async function analyze() {
    if (!text.trim()) return;
    setLoading(true);
    setMessage("");

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        views: views ? Number(views) : null,
        likes: likes ? Number(likes) : null,
        comments: comments ? Number(comments) : null,
        systemPrompt,
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMessage(data.detail ? `${data.error}\n${data.detail}` : data.error || "분석 실패");
      return;
    }

    const normalized = {
      ...data,
      verdict: data.verdict ?? verdictByScore(data.score ?? 0),
    } as AnalyzeResult;

    setResult(normalized);
    setCount((v) => v + 1);

    const { error } = await supabase.from("datasets").insert({
      title: text.slice(0, 48),
      description: text,
      views: views ? Number(views) : null,
      likes: likes ? Number(likes) : null,
      comments: comments ? Number(comments) : null,
      viewer_sentiment: null,
      ref_gemini: null,
      ref_mozaic: null,
      ref_claude: null,
      ref_chatgpt: null,
      ground_truth: JSON.stringify(normalized),
    });

    if (error) setMessage(`Supabase 저장 실패: ${error.message}`);
    else {
      setMessage("분석 및 저장 완료");
      const { data } = await supabase
        .from("datasets")
        .select("*")
        .order("created_at", { ascending: false });
      setRows((data ?? []) as DatasetRow[]);
    }
  }

  function calcCorrelation(targetRows: DatasetRow[]) {
    const valid = targetRows
      .map((row) => {
        const parsed = parseGroundTruth(row.ground_truth);
        return {
          score: parsed?.score ?? null,
          views: row.views ?? null,
        };
      })
      .filter(
        (item): item is { score: number; views: number } =>
          typeof item.score === "number" && typeof item.views === "number"
      );

    return pearsonCorrelation(
      valid.map((v) => v.score),
      valid.map((v) => v.views)
    );
  }

  async function runReanalyze() {
    if (selectedIds.length === 0) return;
    setReAnalyzing(true);
    setComparison(null);

    const targetRows = rows.filter((row) => selectedIds.includes(row.id));
    const beforeCorr = calcCorrelation(rows);
    const localRows = [...rows];
    const changes: Array<{
      id: string;
      description: string;
      before: number | null;
      after: number | null;
      diff: number | null;
      views: number | null;
    }> = [];

    setProgress({ current: 0, total: targetRows.length });

    for (let i = 0; i < targetRows.length; i += 1) {
      const row = targetRows[i];
      setProgress({ current: i + 1, total: targetRows.length });

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: row.description ?? "",
          views: row.views ?? null,
          likes: row.likes ?? null,
          comments: row.comments ?? null,
          systemPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(
          data?.detail
            ? `재분석 실패: ${data.error}\n${data.detail}`
            : `재분석 실패: ${data?.error || "알 수 없는 오류"}`
        );
        continue;
      }

      const newResult = {
        ...data,
        verdict: data.verdict ?? verdictByScore(data.score ?? 0),
      } as AnalyzeResult;
      const prevScore = parseGroundTruth(row.ground_truth)?.score ?? null;

      await supabase
        .from("datasets")
        .update({ ground_truth: JSON.stringify(newResult) })
        .eq("id", row.id);

      const localIndex = localRows.findIndex((r) => r.id === row.id);
      if (localIndex >= 0) {
        localRows[localIndex] = {
          ...localRows[localIndex],
          ground_truth: JSON.stringify(newResult),
        };
      }

      changes.push({
        id: row.id,
        description: row.description ?? "",
        before: prevScore,
        after: newResult.score,
        diff:
          prevScore === null || typeof newResult.score !== "number"
            ? null
            : Number((newResult.score - prevScore).toFixed(1)),
        views: row.views ?? null,
      });
    }

    const afterCorr = calcCorrelation(localRows);
    setRows(localRows);
    setComparison({ beforeCorr, afterCorr, changes });
    setReAnalyzing(false);
    setSelectedIds([]);
    setMessage(
      `재분석 완료! 상관계수: 이전 ${beforeCorr?.toFixed(3) ?? "N/A"} → 현재 ${
        afterCorr?.toFixed(3) ?? "N/A"
      }`
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="card p-5">
        <h1 className="text-2xl font-bold text-white">3초 훅 분석기</h1>
        <p className="mt-2 text-sm text-[#b0b0b0]">
          분석 횟수 {count} · 하위요소 수 {subElementCount} ·{" "}
          {mounted ? `현재 W${toSubscript(wVersion)}` : "W 버전 로딩 중..."}
        </p>
      </section>

      <section className="card p-5">
        <button
          type="button"
          className="text-sm text-[#e0e0e0]"
          onClick={() => setShowPromptEditor((v) => !v)}
        >
          {showPromptEditor ? "▼" : "▶"} 현재 W 프롬프트 보기/수정
        </button>
        {showPromptEditor && (
          <div className="mt-4 space-y-3">
            <textarea
              className="input min-h-64 font-mono-ui text-xs"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={applyPrompt}>
                W 적용
              </button>
              <button type="button" className="btn" onClick={restoreDefaultPrompt}>
                기본값 복원
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h3 className="text-lg font-semibold text-white">기존 데이터 재분석</h3>
        <div className="mt-3 flex items-center gap-3">
          <label className="text-sm text-[#b0b0b0]">
            <input
              className="mr-2"
              type="checkbox"
              checked={rows.length > 0 && selectedIds.length === rows.length}
              onChange={(e) =>
                setSelectedIds(e.target.checked ? rows.map((r) => r.id) : [])
              }
            />
            전체선택
          </label>
          <button className="btn" onClick={runReanalyze} disabled={reAnalyzing || selectedIds.length === 0}>
            {reAnalyzing
              ? `${progress.total}개 중 ${progress.current}개 분석 중...`
              : "🔄 선택한 데이터 재분석"}
          </button>
        </div>
        {reAnalyzing && (
          <div className="mt-3 h-2 w-full rounded-full bg-[#1d1d31]">
            <div
              className="h-2 rounded-full bg-[#00ff88]"
              style={{
                width:
                  progress.total === 0
                    ? "0%"
                    : `${Math.round((progress.current / progress.total) * 100)}%`,
              }}
            />
          </div>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[#b0b0b0]">
              <tr>
                <th className="pb-2">선택</th>
                <th className="pb-2">영상 묘사</th>
                <th className="pb-2">현재 훅점수</th>
                <th className="pb-2">조회수</th>
                <th className="pb-2">마지막 분석 시간</th>
              </tr>
            </thead>
            <tbody className="text-[#e0e0e0]">
              {rows.map((row) => {
                const parsed = parseGroundTruth(row.ground_truth);
                return (
                  <tr key={row.id} className="border-t border-[#1a1a2e]">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked
                              ? [...prev, row.id]
                              : prev.filter((id) => id !== row.id)
                          )
                        }
                      />
                    </td>
                    <td className="py-2">{shorten(row.description ?? "-", 50)}</td>
                    <td className="py-2">{parsed?.score ?? "-"}</td>
                    <td className="py-2">{row.views ?? "-"}</td>
                    <td className="py-2">
                      {row.created_at?.slice(0, 16).replace("T", " ") ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {comparison && (
        <section className="card space-y-4 p-5">
          <div className="flex items-center gap-4">
            <p className="text-lg font-bold text-white">
              이전 상관계수: {comparison.beforeCorr?.toFixed(3) ?? "N/A"}
            </p>
            <p className="text-lg font-bold text-white">
              현재 상관계수: {comparison.afterCorr?.toFixed(3) ?? "N/A"}
            </p>
            <p
              className={`text-sm font-semibold ${
                (comparison.afterCorr ?? -999) > (comparison.beforeCorr ?? -999)
                  ? "text-[#00ff88]"
                  : "text-[#ff3b5c]"
              }`}
            >
              {(comparison.afterCorr ?? -999) > (comparison.beforeCorr ?? -999)
                ? "↑ 개선!"
                : "↓ 악화"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[#b0b0b0]">
                <tr>
                  <th className="pb-2">영상</th>
                  <th className="pb-2">이전 훅점수</th>
                  <th className="pb-2">새 훅점수</th>
                  <th className="pb-2">변화</th>
                  <th className="pb-2">조회수</th>
                </tr>
              </thead>
              <tbody className="text-[#e0e0e0]">
                {comparison.changes.map((row) => (
                  <tr key={row.id} className="border-t border-[#1a1a2e]">
                    <td className="py-2">{shorten(row.description, 50)}</td>
                    <td className="py-2">{row.before ?? "-"}</td>
                    <td className="py-2">{row.after ?? "-"}</td>
                    <td
                      className={`py-2 ${
                        (row.diff ?? 0) >= 0 ? "text-[#00ff88]" : "text-[#ff3b5c]"
                      }`}
                    >
                      {row.diff === null ? "-" : row.diff > 0 ? `+${row.diff}` : row.diff}
                    </td>
                    <td className="py-2">{row.views ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card space-y-4 p-5">
        <textarea
          className="input min-h-36"
          placeholder="영상의 첫 3초를 텍스트로 묘사하세요."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="input font-mono-ui"
            placeholder="조회수"
            value={views}
            onChange={(e) => setViews(e.target.value)}
          />
          <input
            className="input font-mono-ui"
            placeholder="좋아요"
            value={likes}
            onChange={(e) => setLikes(e.target.value)}
          />
          <input
            className="input font-mono-ui"
            placeholder="댓글수"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </div>
        <p className="inline-flex w-fit rounded-full border border-[#ffaa00] px-3 py-1 text-xs text-[#ffaa00]">
          선택 · AI에게 비공개
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              className="example-pill"
              onClick={() => setText(example)}
              type="button"
              title={example}
            >
              {shorten(example)}
            </button>
          ))}
        </div>
        <button className="btn" onClick={analyze} disabled={loading}>
          {loading ? "분석 중..." : "🧠 3초 훅 분석하기"}
        </button>
      </section>

      {result && (
        <>
          <section className="card grid gap-4 p-5 md:grid-cols-2">
            <div>
              <p className="text-sm text-[#b0b0b0]">HOOK SCORE</p>
              <p
                className={`font-mono-ui text-[56px] font-extrabold leading-none ${
                  result.score >= 8 ? "score-strong" : "score-mid"
                }`}
              >
                {result.score}
              </p>
              <p className="mt-3">
                <span className="rounded-full border border-[#2a2a40] bg-[#121224] px-3 py-1 text-sm text-[#e0e0e0]">
                  {result.verdict}
                </span>
              </p>
            </div>
            <div className="text-sm text-[#e0e0e0]">
              <p>조회수: {views || "-"}</p>
              <p>좋아요: {likes || "-"}</p>
              <p>댓글수: {comments || "-"}</p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <ScoreBars
              title={`생존자극 (${result.s_total}/10)`}
              icon="⚡"
              color="red"
              items={[
                { name: "threat", value: result.s_threat, reason: result.s_threat_r },
                { name: "loss_fear", value: result.s_loss, reason: result.s_loss_r },
                { name: "uncertainty", value: result.s_uncert, reason: result.s_uncert_r },
              ]}
            />
            <ScoreBars
              title={`번식자극 (${result.r_total}/10)`}
              icon="💎"
              color="purple"
              items={[
                { name: "physical_attraction", value: result.r_phys, reason: result.r_phys_r },
                { name: "status_resource", value: result.r_status, reason: result.r_status_r },
                { name: "social_charm", value: result.r_charm, reason: result.r_charm_r },
              ]}
            />
            <ScoreBars
              title={`감정강도 (${result.e_total}/10)`}
              icon="🔥"
              color="yellow"
              items={[
                { name: "trigger_speed", value: result.e_speed, reason: result.e_speed_r },
                { name: "emotion_clarity", value: result.e_clarity, reason: result.e_clarity_r },
                { name: "intensity", value: result.e_intense, reason: result.e_intense_r },
              ]}
            />
          </section>

          <section className="card space-y-2 p-5 text-sm text-[#e0e0e0]">
            <p>지배감정: {result.e_dominant}</p>
            <p>훅 메커니즘: {result.hook}</p>
            <p>시청 동기: {result.motivation}</p>
            <button className="btn" onClick={() => setShowReason((v) => !v)}>
              상세 분석 근거 토글
            </button>
            {showReason && (
              <div className="rounded-lg border border-[#1a1a2e] bg-[#101024] p-3 text-xs text-[#b0b0b0]">
                {result.disc_desc}
              </div>
            )}
            <p>
              발견된 하위 요소: <span className="text-[#00ff88]">{result.disc_label}</span>
            </p>
            <p className="text-[#b0b0b0]">매핑: {result.disc_maps}</p>
            <p className="text-[#00ff88]">개선 제안: {result.tip}</p>
          </section>
        </>
      )}

      {message && <p className="text-sm text-[#b0b0b0]">{message}</p>}
    </div>
  );
}
