"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { correlationLabel, pearsonCorrelation } from "@/lib/stats";
import { AnalyzeResult, DatasetRow } from "@/types";

function parseGroundTruth(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as AnalyzeResult;
  } catch {
    return null;
  }
}

export default function HistoryPage() {
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("datasets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        setMessage(error.message);
        return;
      }
      setRows((data ?? []) as DatasetRow[]);
    }
    void load();
  }, []);

  const corr = useMemo(() => {
    const valid = rows.filter(
      (r) =>
        typeof parseGroundTruth(r.ground_truth)?.score === "number" &&
        typeof r.views === "number" &&
        r.views !== null
    );
    const x = valid.map((v) => Number(parseGroundTruth(v.ground_truth)?.score ?? 0));
    const y = valid.map((v) => Number(v.views));
    return pearsonCorrelation(x, y);
  }, [rows]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="card p-5">
        <h1 className="text-2xl font-bold text-zinc-900">분석 히스토리 + 검증 대시보드</h1>
        <p className="mt-2 text-sm text-zinc-600">
          훅점수 vs 조회수 상관계수:{" "}
          <span className="text-zinc-900">{corr === null ? "-" : corr.toFixed(3)}</span> ·{" "}
          {correlationLabel(corr)}
        </p>
      </section>

      <section className="card overflow-x-auto p-5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-100 text-zinc-700">
            <tr>
              <th className="pb-2">일시</th>
              <th className="pb-2">3초 텍스트</th>
              <th className="pb-2">훅점수</th>
              <th className="pb-2">판정</th>
              <th className="pb-2">조회수</th>
            </tr>
          </thead>
          <tbody className="text-zinc-800">
            {rows.map((r) => {
              const parsed = parseGroundTruth(r.ground_truth);
              return (
              <tr key={r.id} className="border-t border-zinc-200">
                <td className="py-2">{r.created_at?.slice(0, 16).replace("T", " ")}</td>
                <td className="max-w-xl truncate py-2">{r.description}</td>
                <td className="py-2">{parsed?.score ?? "-"}</td>
                <td className="py-2">{parsed?.verdict ?? "-"}</td>
                <td className="py-2">{r.views ?? "-"}</td>
              </tr>
            )})}
          </tbody>
        </table>
      </section>

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  );
}
