"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toSubscript, W_VERSION_STORAGE_KEY } from "@/lib/wPrompt";

const menus = [
  { href: "/history", label: "히스토리" },
  { href: "/optimize", label: "최적화" },
  { href: "/analyze", label: "단일 테스트" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [wVersion, setWVersion] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const loadVersion = () => {
      const version = Number(localStorage.getItem(W_VERSION_STORAGE_KEY) ?? "0");
      if (!Number.isNaN(version)) setWVersion(version);
      setMounted(true);
    };
    loadVersion();
    window.addEventListener("focus", loadVersion);
    return () => window.removeEventListener("focus", loadVersion);
  }, []);

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white">
      <div className="sticky top-0 flex h-screen flex-col p-5">
        <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-lg font-semibold text-zinc-900">Mozaic Prompt</p>
          <p className="mt-1 text-xs text-zinc-600">3초 훅 프롬프트 최적화 엔진</p>
          <p className="mt-2 text-xs text-blue-600">
            {mounted ? `현재 W${toSubscript(wVersion)}` : "W 로딩 중..."}
          </p>
        </div>
        <nav className="space-y-2">
          {menus.map((m) => {
            const active = pathname.startsWith(m.href);
            return (
              <Link
                key={m.href}
                href={m.href}
                className={`block rounded-r-lg border-l-2 px-3 py-2 text-sm transition ${
                  active
                    ? "border-l-blue-600 bg-blue-50 text-zinc-900"
                    : "border-l-transparent text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {m.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
