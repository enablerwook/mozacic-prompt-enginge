import { NextResponse } from "next/server";
import type { MockMozaicRow } from "@/lib/mockMozaicData";

type MozaicApiItem = {
  id: string;
  title?: string | null;
  proxy_data?: string | null;
  script_structure?: { full?: string } | null;
  content_type?: string[] | string | null;
  stats?: { playCount?: number; likeCount?: number } | null;
  posted_at?: string | null;
  created_at?: string | null;
  platform?: string | null;
};

function getElapsedDays(isoDate: string): number {
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const upload = startOfDay(new Date(isoDate));
  const today = startOfDay(new Date());
  return Math.max(0, Math.round((today - upload) / 86_400_000));
}

function transform(item: MozaicApiItem): MockMozaicRow {
  const views = item.stats?.playCount ?? 0;
  const likes = item.stats?.likeCount ?? 0;
  const date = item.posted_at ?? item.created_at ?? new Date().toISOString();
  const contentType = Array.isArray(item.content_type)
    ? item.content_type[0] ?? ""
    : (item.content_type ?? "");

  return {
    id: item.id,
    title: item.title ?? "",
    description: item.proxy_data ?? "",
    script: item.script_structure?.full ?? "",
    language: item.platform ?? "Korean",
    contentType,
    views,
    likes,
    date,
    elapsedDays: getElapsedDays(date),
    likeRatio: views > 0 ? (likes / views) * 100 : 0,
    createdAt: item.created_at ?? undefined,
  };
}

export async function GET() {
  const apiKey = process.env.MOZAIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MOZAIC_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  const res = await fetch("https://mozaic.im/api/video-analyses", {
    headers: { "X-API-Key": apiKey },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Mozaic API 오류: ${res.status}`, detail: text },
      { status: 502 }
    );
  }

  const data = (await res.json()) as MozaicApiItem[];
  const rows = data.map(transform);
  return NextResponse.json(rows);
}
