import { NextResponse } from "next/server";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/analyzer";
import { safeParse } from "@/lib/safeParse";
import { AnalyzeResult, OptimizeResult } from "@/types";

type ClaudeMessage = {
  content?: Array<{ type: string; text?: string }>;
};

class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status = 500, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

const optimizeSystemPrompt = `
You are a precise JSON generator.
Return valid raw JSON only.
`;

const RESPONSE_FORMAT_INSTRUCTION = `
위의 분석 기준으로 평가한 뒤, 반드시 아래 JSON 형식으로만 응답하세요.
다른 텍스트나 마크다운 없이 순수 JSON만 출력하세요.

{"s_threat":0,"s_threat_r":"위협감지 이유","s_loss":0,"s_loss_r":"손실공포 이유","s_uncert":0,"s_uncert_r":"불확실성 이유","s_total":0,"r_phys":0,"r_phys_r":"신체적매력 이유","r_status":0,"r_status_r":"지위자원 이유","r_charm":0,"r_charm_r":"사회적매력 이유","r_total":0,"e_speed":0,"e_speed_r":"유발속도 이유","e_clarity":0,"e_clarity_r":"감정명확성 이유","e_intense":0,"e_intense_r":"강도 이유","e_total":0,"e_dominant":"지배감정","hook":"훅 메커니즘","motivation":"시청 동기","score":0.0,"verdict":"판정","tip":"개선 제안","disc_label":"","disc_maps":"","disc_desc":""}

점수 규칙:
- s_threat: 0-3, s_loss: 0-3, s_uncert: 0-4, s_total: 합계(0-10)
- r_phys: 0-4, r_status: 0-3, r_charm: 0-3, r_total: 합계(0-10)
- e_speed: 0-3, e_clarity: 0-3, e_intense: 0-4, e_total: 합계(0-10)
- score: s_total*0.4 + r_total*0.3 + e_total*0.3 (소수점 1자리)
- verdict: "강력한 훅"(>=6) / "보통 훅"(3-5.9) / "약한 훅"(1-2.9) / "훅 없음"(<1)
- 모든 이유(_r)는 한국어로
- disc_* 는 발견시에만 채우고 없으면 빈 문자열
`;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toText(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim();
  return fallback;
}

function verdictByScore(score: number) {
  if (score >= 6) return "강력한 훅";
  if (score >= 3) return "보통 훅";
  if (score >= 1) return "약한 훅";
  return "훅 없음";
}

function normalizeAnalyzeResult(input?: Partial<AnalyzeResult> | null): AnalyzeResult {
  const base = fallbackAnalyze();
  const s_threat = clamp(toNumber(input?.s_threat, base.s_threat), 0, 3);
  const s_loss = clamp(toNumber(input?.s_loss, base.s_loss), 0, 3);
  const s_uncert = clamp(toNumber(input?.s_uncert, base.s_uncert), 0, 4);
  const s_total = clamp(s_threat + s_loss + s_uncert, 0, 10);

  const r_phys = clamp(toNumber(input?.r_phys, base.r_phys), 0, 4);
  const r_status = clamp(toNumber(input?.r_status, base.r_status), 0, 3);
  const r_charm = clamp(toNumber(input?.r_charm, base.r_charm), 0, 3);
  const r_total = clamp(r_phys + r_status + r_charm, 0, 10);

  const e_speed = clamp(toNumber(input?.e_speed, base.e_speed), 0, 3);
  const e_clarity = clamp(toNumber(input?.e_clarity, base.e_clarity), 0, 3);
  const e_intense = clamp(toNumber(input?.e_intense, base.e_intense), 0, 4);
  const e_total = clamp(e_speed + e_clarity + e_intense, 0, 10);

  const score = Number((s_total * 0.4 + r_total * 0.3 + e_total * 0.3).toFixed(1));

  return {
    s_threat,
    s_threat_r: toText(input?.s_threat_r, base.s_threat_r),
    s_loss,
    s_loss_r: toText(input?.s_loss_r, base.s_loss_r),
    s_uncert,
    s_uncert_r: toText(input?.s_uncert_r, base.s_uncert_r),
    s_total,
    r_phys,
    r_phys_r: toText(input?.r_phys_r, base.r_phys_r),
    r_status,
    r_status_r: toText(input?.r_status_r, base.r_status_r),
    r_charm,
    r_charm_r: toText(input?.r_charm_r, base.r_charm_r),
    r_total,
    e_speed,
    e_speed_r: toText(input?.e_speed_r, base.e_speed_r),
    e_clarity,
    e_clarity_r: toText(input?.e_clarity_r, base.e_clarity_r),
    e_intense,
    e_intense_r: toText(input?.e_intense_r, base.e_intense_r),
    e_total,
    e_dominant: toText(input?.e_dominant, base.e_dominant),
    hook: toText(input?.hook, base.hook),
    motivation: toText(input?.motivation, base.motivation),
    score,
    verdict: toText(input?.verdict, verdictByScore(score)),
    tip: toText(input?.tip, base.tip),
    disc_label: toText(input?.disc_label, ""),
    disc_maps: toText(input?.disc_maps, ""),
    disc_desc: toText(input?.disc_desc, ""),
  };
}

function buildOptimizeUserPrompt(history: string, correlation: string, currentW: string | null) {
  const wSection = currentW
    ? `현재 W 프롬프트 전문:\n"""\n${currentW}\n"""\n\n`
    : "";
  return `당신은 숏폼 영상 분석 프롬프트를 최적화하는 메타 엔지니어입니다.

${wSection}아래는 현재 분석 프롬프트(W)로 여러 영상을 분석한 결과입니다.
각 영상에는 "훅 점수"(W가 매긴 점수)와 "실제 조회수"가 있습니다.

핵심 원칙:
- 훅 점수가 낮은데 조회수가 높다면 → W가 그 영상의 강점을 놓친 것입니다. W를 고쳐야 합니다.
- 훅 점수가 높은데 조회수가 낮다면 → W가 과대평가한 것입니다. W의 기준이 잘못된 겁니다.
- 영상 자체를 평가하지 마세요. W(분석 프롬프트)만 평가하고 개선하세요.

현재 W의 분석 프레임:
- 생존 자극 (위협감지 0-3, 손실공포 0-3, 불확실성 0-4)
- 번식 자극 (신체적매력 0-4, 지위/자원 0-3, 사회적매력 0-3)
- 감정 강도 (유발속도 0-3, 감정명확성 0-3, 강도 0-4)
- 가중치: 생존×0.4 + 번식×0.3 + 감정×0.3

분석 히스토리:
${history}

상관계수 (훅점수 ↔ 조회수): ${correlation}

당신의 임무:
1. W의 어떤 항목이 실제 성과를 잘못 예측하는지 진단하세요
2. 놓치고 있는 후킹 요소가 있다면 기존 항목에 통합하세요
3. 가중치(0.4/0.3/0.3)가 적절한지 평가하세요
4. 개선된 W 프롬프트 전문을 생성하세요

절대 하지 말 것:
- 영상 콘텐츠에 대한 조언 금지
- "훅이 약하다" 같은 영상 평가 금지
- W 프롬프트 개선에만 집중하세요

반드시 JSON으로만 응답 (마크다운 금지):
{"diagnosis":"W의 문제점 진단 (한국어)","weak_items":"성과 예측에 실패한 항목들","missing_factors":"W가 놓치고 있는 요소들","weight_suggestion":"가중치 조정 제안","prompt":"개선된 완전한 분석 프롬프트 전문 (한국어, 그대로 복사하여 시스템 프롬프트로 사용 가능)","changes":"W₀ 대비 변경사항","version":"W1"}

히스토리 데이터를 넣을 때 각 항목은 이 형식으로:
"영상: {묘사} | 훅점수: {score} | 조회수: {views} | 판정: {verdict}"`;
}

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"] as const;
type GeminiModel = typeof GEMINI_MODELS[number];

function resolveGeminiModel(raw: unknown): GeminiModel {
  if (typeof raw === "string" && (GEMINI_MODELS as readonly string[]).includes(raw)) {
    return raw as GeminiModel;
  }
  return "gemini-2.5-flash";
}

async function callGemini(system: string, user: string, model: GeminiModel = "gemini-2.5-flash") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiError("GEMINI_API_KEY가 설정되지 않았습니다.", 500);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(`Gemini 오류: ${res.status}`, 502, text);
  }
  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callClaude(system: string, user: string, model = "claude-sonnet-4-6") {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("[/api/analyze] Missing ANTHROPIC_API_KEY");
    throw new ApiError("ANTHROPIC_API_KEY가 설정되지 않았습니다.", 500);
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.log("[/api/analyze] Anthropic API error", {
      status: res.status,
      statusText: res.statusText,
      responseText: text,
    });
    throw new ApiError(`Anthropic 오류: ${res.status}`, 502, text);
  }
  const json = (await res.json()) as ClaudeMessage;
  return json.content?.find((c) => c.type === "text")?.text ?? "";
}

function fallbackAnalyze(): AnalyzeResult {
  return {
    s_threat: 1,
    s_threat_r: "위협 단서가 약합니다.",
    s_loss: 1,
    s_loss_r: "손실 회피 메시지가 약합니다.",
    s_uncert: 2,
    s_uncert_r: "궁금증은 있으나 강도가 낮습니다.",
    s_total: 4,
    r_phys: 1,
    r_phys_r: "외모 단서가 제한적입니다.",
    r_status: 1,
    r_status_r: "지위/자원 정보가 약합니다.",
    r_charm: 1,
    r_charm_r: "행동 기반 매력이 부족합니다.",
    r_total: 3,
    e_speed: 2,
    e_speed_r: "초반 자극 속도는 보통입니다.",
    e_clarity: 2,
    e_clarity_r: "감정 방향은 보통 수준입니다.",
    e_intense: 2,
    e_intense_r: "강한 감정 피크가 부족합니다.",
    e_total: 6,
    e_dominant: "호기심",
    hook: "정보 비대칭 기반 훅",
    motivation: "결과 확인 욕구",
    score: 4.5,
    verdict: "보통 훅",
    tip: "손실/위협 문장을 첫 문장에 배치하세요.",
    disc_label: "요소 매핑",
    disc_maps: "uncertainty -> 정보 비대칭, emotion_clarity -> 감정 방향성",
    disc_desc: "새 요소를 기존 항목 하위요소로 매핑했습니다.",
  };
}

export async function POST(req: Request) {
  try {
    let body: {
      mode?: string;
      ai?: string;
      geminiVersion?: string;
      scoringModel?: string;
      text?: unknown;
      views?: unknown;
      likes?: unknown;
      comments?: unknown;
      systemPrompt?: unknown;
      payload?: unknown;
    };
    try {
      body = (await req.json()) as {
        mode?: string;
        ai?: string;
        geminiVersion?: string;
        scoringModel?: string;
        text?: unknown;
        views?: unknown;
        likes?: unknown;
        comments?: unknown;
        systemPrompt?: unknown;
        payload?: unknown;
      };
    } catch (parseError) {
      console.log("[/api/analyze] Invalid JSON body", parseError);
      throw new ApiError("요청 본문(JSON) 파싱에 실패했습니다.", 400);
    }

    console.log("[/api/analyze] Incoming request", {
      mode: body.mode ?? "analyze",
      hasSystemPrompt:
        typeof body.systemPrompt === "string" && body.systemPrompt.trim().length > 0,
      hasText: typeof body.text === "string" && body.text.trim().length > 0,
    });

    if (body.mode === "batch-score") {
      // 여러 행을 한 번의 AI 호출로 채점
      const payload = (body.payload ?? {}) as {
        rows?: unknown;
        systemPrompt?: unknown;
      };
      const rows = Array.isArray(payload.rows) ? payload.rows as Array<{ id: string; text: string; views?: number; likes?: number }> : [];
      const wPrompt = typeof payload.systemPrompt === "string" && payload.systemPrompt.trim()
        ? payload.systemPrompt.trim()
        : ANALYSIS_SYSTEM_PROMPT;
      if (rows.length === 0) {
        return NextResponse.json([], { status: 200 });
      }

      const rowLines = rows.map((r, i) =>
        `${i + 1}. [id=${r.id}] 설명: ${r.text} | 조회수: ${r.views ?? 0} | 좋아요: ${r.likes ?? 0}`
      ).join("\n");

      const batchSystem = `${wPrompt}\n\n당신은 위 기준으로 숏폼 영상을 채점하는 분석기입니다.`;
      const batchUser = `아래 영상 목록 각각에 대해 위 기준으로 훅 점수(score)와 판정(verdict)을 계산하세요.
score 규칙: s_total(0-10)×0.4 + r_total(0-10)×0.3 + e_total(0-10)×0.3, 소수점 1자리
verdict: "강력한 훅"(≥6) / "보통 훅"(3-5.9) / "약한 훅"(1-2.9) / "훅 없음"(<1)

반드시 JSON 배열로만 응답 (마크다운 금지):
[{"id":"...","score":0.0,"verdict":"..."}]

영상 목록:
${rowLines}`;

      const useGemini = body.ai === "gemini";
      const geminiModel = resolveGeminiModel(body.scoringModel ?? body.geminiVersion);
      const claudeModel = body.scoringModel === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
      const batchText = useGemini
        ? await callGemini(batchSystem, batchUser, geminiModel)
        : await callClaude(batchSystem, batchUser, claudeModel);

      const parsed = safeParse<Array<{ id: string; score: number; verdict: string }>>(batchText);
      return NextResponse.json(parsed ?? [], { status: 200 });
    }

    if (body.mode === "optimize") {
      const payload = (body.payload ?? {}) as { historyLines?: unknown; correlation?: unknown; currentW?: unknown };
      const history = Array.isArray(payload.historyLines)
        ? payload.historyLines.join("\n")
        : "히스토리 없음";
      const correlation =
        payload.correlation === null || payload.correlation === undefined
          ? "N/A"
          : String(payload.correlation);
      const currentW = typeof payload.currentW === "string" && payload.currentW.trim()
        ? payload.currentW.trim()
        : null;
      const user = buildOptimizeUserPrompt(history, correlation, currentW);
      const useGemini = body.ai === "gemini";
      const geminiModel = resolveGeminiModel(body.geminiVersion);
      const text = useGemini
        ? await callGemini(optimizeSystemPrompt, user, geminiModel)
        : await callClaude(optimizeSystemPrompt, user);
      console.log("[/api/analyze] optimize raw response", text?.slice(0, 500));
      const parsed = safeParse<OptimizeResult>(text);
      if (!parsed) {
        return NextResponse.json(
          {
            diagnosis: "W 출력 파싱에 실패했습니다. JSON 구조를 더 엄격히 강제해야 합니다.",
            weak_items: "사회적매력, 불확실성 항목에서 성과 예측 불일치가 큽니다.",
            missing_factors: "초기 시선고정력, 정보 비대칭 신호를 기존 항목에 통합 필요",
            weight_suggestion: "생존 0.35 / 번식 0.25 / 감정 0.40 재검토",
            prompt:
              "당신은 숏폼 3초 훅 분석기다. 기존 9개 항목으로 채점하되 이유를 한국어로 간결히 작성하라.",
            changes: "판정 경계 재조정, 감정 가중치 상향, 불확실성 정의 명확화",
            version: "W1",
          },
          { status: 200 }
        );
      }
      return NextResponse.json(parsed);
    }

    const textInput = String(body.text ?? "").trim();
    if (!textInput) {
      throw new ApiError("text는 필수입니다.", 400);
    }

    const user = [
      `3초 설명: ${textInput}`,
      `성과지표(비공개 참조): views=${body.views ?? ""}, likes=${body.likes ?? ""}, comments=${body.comments ?? ""}`,
      "반드시 flat JSON 단일 객체만 출력",
    ].join("\n");

    const userCustomW =
      typeof body.systemPrompt === "string" && body.systemPrompt.trim()
        ? body.systemPrompt
        : ANALYSIS_SYSTEM_PROMPT;
    const systemPrompt = `${userCustomW}\n\n${RESPONSE_FORMAT_INSTRUCTION}`;
    console.log("[/api/analyze] Prompt sources", {
      systemPrompt: systemPrompt === ANALYSIS_SYSTEM_PROMPT ? "default" : "custom",
      userPreview: user.slice(0, 120),
    });

    const text = await callClaude(systemPrompt, user);
    const parsed = safeParse<AnalyzeResult>(text);
    const normalized = normalizeAnalyzeResult(parsed ?? fallbackAnalyze());
    return NextResponse.json(normalized);
  } catch (error) {
    if (error instanceof ApiError) {
      console.log("[/api/analyze] ApiError", {
        status: error.status,
        message: error.message,
        detail: error.detail,
      });
      return NextResponse.json(
        { error: error.message, detail: error.detail ?? null },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : "서버 오류";
    console.log("[/api/analyze] Unexpected error", error);
    return NextResponse.json({ error: message, detail: null }, { status: 500 });
  }
}
