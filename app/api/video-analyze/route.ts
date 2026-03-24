import { NextResponse } from "next/server";

async function analyzeClaude(thumbnailDataUrl: string, prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");

  const base64 = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, "");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: prompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            },
            { type: "text", text: "위 영상의 첫 프레임을 보고 분석해줘." },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude 오류: ${res.status} — ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return json.content?.find((c) => c.type === "text")?.text ?? "";
}

async function analyzeGemini(videoFile: File, prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");

  const videoBuffer = await videoFile.arrayBuffer();
  const videoBase64 = Buffer.from(videoBuffer).toString("base64");
  const mimeType = videoFile.type || "video/mp4";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: prompt }] },
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: mimeType, data: videoBase64 } },
              { text: "위 영상을 분석해줘." },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini 오류: ${res.status} — ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const video = formData.get("video") as File | null;
    const thumbnail = (formData.get("thumbnail") as string | null) ?? "";
    const claudePrompt = ((formData.get("claudePrompt") as string) ?? "").trim();
    const geminiPrompt = ((formData.get("geminiPrompt") as string) ?? "").trim();

    if (!video) {
      return NextResponse.json({ error: "영상 파일이 없습니다." }, { status: 400 });
    }

    const [claudeResult, geminiResult] = await Promise.allSettled([
      claudePrompt && thumbnail ? analyzeClaude(thumbnail, claudePrompt) : Promise.resolve(""),
      geminiPrompt ? analyzeGemini(video, geminiPrompt) : Promise.resolve(""),
    ]);

    return NextResponse.json({
      claude:
        claudeResult.status === "fulfilled"
          ? claudeResult.value
          : `오류: ${(claudeResult as PromiseRejectedResult).reason?.message ?? "알 수 없는 오류"}`,
      gemini:
        geminiResult.status === "fulfilled"
          ? geminiResult.value
          : `오류: ${(geminiResult as PromiseRejectedResult).reason?.message ?? "알 수 없는 오류"}`,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "서버 오류" }, { status: 500 });
  }
}
