"use client";

import { useRef, useState } from "react";

type AnalysisResult = {
  claude: string;
  gemini: string;
};

/** 영상 첫 프레임을 JPEG base64 dataURL로 추출 */
function extractThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const objectUrl = URL.createObjectURL(file);

    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };
    video.onseeked = () => {
      try {
        const maxW = 1280;
        const w = Math.min(video.videoWidth, maxW);
        const h = Math.round((w / video.videoWidth) * video.videoHeight);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("영상 로드 실패"));
    };
    video.src = objectUrl;
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AnalyzePage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [claudePrompt, setClaudePrompt] = useState("");
  const [geminiPrompt, setGeminiPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setError("영상 파일(mp4, mov, webm 등)만 첨부할 수 있습니다.");
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setResult(null);
    setError("");
  }

  async function runAnalysis() {
    if (!videoFile) return;
    if (!claudePrompt.trim() && !geminiPrompt.trim()) {
      setError("프롬프트를 하나 이상 입력해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const thumbnail = await extractThumbnail(videoFile);

      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("thumbnail", thumbnail);
      formData.append("claudePrompt", claudePrompt.trim());
      formData.append("geminiPrompt", geminiPrompt.trim());

      const res = await fetch("/api/video-analyze", {
        method: "POST",
        body: formData,
      });
      const data = await res.json() as { error?: string; claude?: string; gemini?: string };
      if (!res.ok) {
        setError(data.error ?? "분석에 실패했습니다.");
      } else {
        setResult({ claude: data.claude ?? "", gemini: data.gemini ?? "" });
      }
    } catch (e) {
      setError((e as Error).message || "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  const canRun = !!videoFile && (!!claudePrompt.trim() || !!geminiPrompt.trim()) && !loading;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* 영상 첨부 */}
      <section className="card p-5 space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">영상 첨부</h2>
        <p className="text-xs text-zinc-500">
          mp4, mov, webm 등 영상 파일을 첨부하세요.
          Gemini는 영상 전체를, Claude는 첫 프레임(이미지)으로 분석합니다.
        </p>

        {/* 드래그앤드롭 업로드 영역 */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          className={`rounded-xl border-2 border-dashed transition cursor-pointer
            ${dragging ? "border-blue-400 bg-blue-50" : "border-zinc-200 hover:border-zinc-400"}
            ${videoFile ? "p-3" : "p-10"}`}
        >
          {videoUrl ? (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <video
                src={videoUrl}
                controls
                className="w-full max-h-72 rounded-lg bg-black"
              />
              <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
                <span className="truncate">{videoFile!.name}</span>
                <span className="ml-2 shrink-0">{formatFileSize(videoFile!.size)}</span>
              </div>
              <button
                type="button"
                className="text-xs text-zinc-400 hover:text-red-500 transition px-1"
                onClick={(e) => {
                  e.stopPropagation();
                  URL.revokeObjectURL(videoUrl);
                  setVideoFile(null);
                  setVideoUrl("");
                  setResult(null);
                }}
              >
                ✕ 영상 제거
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-zinc-400 pointer-events-none">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="text-sm font-medium">영상을 드래그하거나 클릭해서 첨부</p>
              <p className="text-xs">mp4 · mov · webm · avi</p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </section>

      {/* 프롬프트 입력 */}
      <div className="grid gap-5 md:grid-cols-2">
        <section className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white">Claude</span>
            <h2 className="text-sm font-semibold text-zinc-900">분석 프롬프트</h2>
          </div>
          <p className="text-xs text-zinc-500">첫 프레임(이미지) 기반으로 분석합니다.</p>
          <textarea
            className="input min-h-52 resize-y font-mono-ui text-sm leading-relaxed"
            placeholder="Claude용 분석 프롬프트를 입력하세요."
            value={claudePrompt}
            onChange={(e) => setClaudePrompt(e.target.value)}
            spellCheck={false}
          />
        </section>

        <section className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white">Gemini</span>
            <h2 className="text-sm font-semibold text-zinc-900">분석 프롬프트</h2>
          </div>
          <p className="text-xs text-zinc-500">영상 파일 전체를 직접 분석합니다.</p>
          <textarea
            className="input min-h-52 resize-y font-mono-ui text-sm leading-relaxed"
            placeholder="Gemini용 분석 프롬프트를 입력하세요."
            value={geminiPrompt}
            onChange={(e) => setGeminiPrompt(e.target.value)}
            spellCheck={false}
          />
        </section>
      </div>

      {/* 실행 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn"
          disabled={!canRun}
          onClick={() => void runAnalysis()}
        >
          {loading ? "분석 중…" : "⚡ 분석 실행"}
        </button>
        {!videoFile && <span className="text-xs text-zinc-500">영상을 먼저 첨부해주세요.</span>}
        {videoFile && !claudePrompt.trim() && !geminiPrompt.trim() && (
          <span className="text-xs text-zinc-500">프롬프트를 하나 이상 입력해주세요.</span>
        )}
        {loading && (
          <span className="text-xs text-zinc-500 animate-pulse">AI가 영상을 분석하는 중입니다…</span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 결과 */}
      {result && (
        <div className="grid gap-5 md:grid-cols-2">
          <section className="card p-5 space-y-3 border border-zinc-200">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-medium text-white">Claude</span>
              <h3 className="text-sm font-semibold text-zinc-900">분석 결과</h3>
            </div>
            {result.claude ? (
              <p className="whitespace-pre-wrap text-sm text-zinc-800 leading-relaxed">{result.claude}</p>
            ) : (
              <p className="text-sm text-zinc-400">프롬프트가 없어 분석하지 않았습니다.</p>
            )}
          </section>

          <section className="card p-5 space-y-3 border border-zinc-200">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white">Gemini</span>
              <h3 className="text-sm font-semibold text-zinc-900">분석 결과</h3>
            </div>
            {result.gemini ? (
              <p className="whitespace-pre-wrap text-sm text-zinc-800 leading-relaxed">{result.gemini}</p>
            ) : (
              <p className="text-sm text-zinc-400">프롬프트가 없어 분석하지 않았습니다.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
