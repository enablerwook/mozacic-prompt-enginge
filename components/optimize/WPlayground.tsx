"use client";

import { useState } from "react";

const FAKE_RESULT = `【Mock 분석 요약】
· 훅 강도: 중상 (첫 문장에 구체적 숫자/대비 있음)
· 위험 요소: 중간 — 정보 밀도가 다소 높아 이탈 가능
· 제안: 오프닝 1문장을 청자 질문형으로 바꾸면 예상 점수 +0.3 (데모 텍스트)`;

export default function WPlayground() {
  const [text, setText] = useState("여기에 테스트할 프롬프트 조각을 붙여 넣어 보세요.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function runTest() {
    if (loading) return;
    setResult(null);
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setResult(FAKE_RESULT);
    }, 2000);
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">W 수동 테스트 놀이터</h2>
      <p className="mb-4 text-xs text-zinc-600">입력 후 버튼을 누르면 2초 로딩 뒤 가짜 결과가 표시됩니다.</p>

      <label className="mb-3 block text-xs text-zinc-600">
        프롬프트 텍스트
        <textarea
          className="input mt-1 min-h-36 resize-y font-mono-ui text-sm leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
        />
      </label>

      <div className="mb-4 flex items-center gap-3">
        <button type="button" className="btn disabled:opacity-50" onClick={runTest} disabled={loading}>
          {loading ? "분석 중…" : "이 W로 테스트하기"}
        </button>
        {loading && (
          <span className="flex items-center gap-2 text-sm text-zinc-600">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-blue-600"
              aria-hidden
            />
            분석 중…
          </span>
        )}
      </div>

      {result && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">가짜 분석 결과</p>
          <pre className="font-mono-ui whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{result}</pre>
        </div>
      )}
    </section>
  );
}
