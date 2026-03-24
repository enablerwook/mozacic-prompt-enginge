"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OptimizeContextField } from "@/lib/optimizeFields";
import {
  formatUploadDayPlus,
  getUploadElapsedDays,
  mockMozaicData,
  type MockMozaicRow,
} from "@/lib/mockMozaicData";

type SortKey = "views_desc" | "views_asc" | "date_desc" | "date_asc";
type FilterMenu = "language" | "views" | "elapsed" | "analysisDate" | null;

/** 슬라이더·입력에서 이 값 이상이면 조회수 상한 없음(MAX), 350만 초과 조회수 행 포함 */
const VIEWS_SLIDER_MAX = 3_500_000;
const VIEWS_SLIDER_STEP = 10_000;
/** D+ 필터 수동 입력 상한 */
const D_PLUS_INPUT_MAX = 9999;
/** 분석일 필터 최대값 — 이 값이면 MAX(제한 없음) */
const ANALYSIS_DAYS_MAX = 100;

/** 서버(Node)·브라우저 모두 동일 문자열 보장 (Hydration). ko-KR + 서울 고정. */
const DISPLAY_LOCALE = "ko-KR" as const;
const DISPLAY_TIME_ZONE = "Asia/Seoul" as const;

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    let s = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      timeZone: DISPLAY_TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    // 일부 런타임은 locale이 ko-KR이어도 AM/PM만 영어로 출력 → 한글로 통일
    s = s.replace(/\bAM\b/gi, "오전").replace(/\bPM\b/gi, "오후");
    return s;
  } catch {
    return iso;
  }
}

function formatViews(n: number) {
  return new Intl.NumberFormat(DISPLAY_LOCALE).format(n);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function parseNum(raw: string, fallback: number) {
  const v = Number(String(raw).replace(/\s/g, "").replace(/,/g, ""));
  return Number.isFinite(v) ? v : fallback;
}

/** 조회수 대비 좋아요 비율 (%) */
function formatLikeRatio(likes: number, views: number) {
  if (views <= 0) return "—";
  const pct = (likes / views) * 100;
  return `${pct < 0.01 ? pct.toFixed(3) : pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`;
}

function FilterDot({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span
      className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600"
      aria-hidden
    />
  );
}

type PopoverPos = { top: number; left: number; width: number };

export type MockDataTableProps = {
  /** 외부에서 주입하는 실제 데이터. 미넘기면 mockMozaicData 사용 */
  rows?: MockMozaicRow[];
  /** 부모가 선택 상태를 관리할 때 (예: 단일 테스트). 미넘기면 테이블 내부 state 사용 */
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (next: Set<string>) => void;
  /** 테이블 아래 추가 UI (실행 버튼 등) */
  footerSlot?: ReactNode;
  /** 제목 아래 보조 설명 */
  subtitleExtra?: ReactNode;
  /** 최적화 탭: 열 헤더 옆에 W 반영 여부 체크박스 */
  showOptimizeFieldToggles?: boolean;
  optimizeFieldInclude?: Record<OptimizeContextField, boolean>;
  onOptimizeFieldIncludeChange?: (key: OptimizeContextField, value: boolean) => void;
};

function OptimizeFieldToggle({
  field,
  show,
  include,
  onChange,
}: {
  field: OptimizeContextField;
  show: boolean;
  include?: Record<OptimizeContextField, boolean>;
  onChange?: (key: OptimizeContextField, value: boolean) => void;
}) {
  if (!show || !include || !onChange) return null;
  return (
    <input
      type="checkbox"
      className="checkbox-mozaic checkbox-mozaic-sm"
      checked={include[field]}
      onChange={(e) => onChange(field, e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${field} W 최적화 반영`}
    />
  );
}

export default function MockDataTable({
  rows: rowsProp,
  selectedIds: selectedIdsProp,
  onSelectedIdsChange,
  footerSlot,
  subtitleExtra,
  showOptimizeFieldToggles = false,
  optimizeFieldInclude,
  onOptimizeFieldIncludeChange,
}: MockDataTableProps = {}) {
  const [asOf] = useState(() => new Date());
  const allRows = useMemo(
    () => (rowsProp !== undefined ? rowsProp : mockMozaicData),
    [rowsProp]
  );

  const [sortKey, setSortKey] = useState<SortKey>("views_desc");
  const [search, setSearch] = useState("");
  const [internalSelected, setInternalSelected] = useState<Set<string>>(() => new Set());

  const controlled = selectedIdsProp !== undefined && onSelectedIdsChange !== undefined;
  const selected = controlled ? selectedIdsProp : internalSelected;

  const commitSelection = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      if (controlled) {
        onSelectedIdsChange!(updater(selectedIdsProp));
      } else {
        setInternalSelected(updater);
      }
    },
    [controlled, onSelectedIdsChange, selectedIdsProp]
  );

  const [viewsMin, setViewsMin] = useState(0);
  /** 유한 숫자 = 상한 포함, POSITIVE_INFINITY = 350만 이상 전부(MAX) */
  const [viewsMax, setViewsMax] = useState<number>(() => Number.POSITIVE_INFINITY);
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [dMin, setDMin] = useState(0);
  const [dMax, setDMax] = useState(D_PLUS_INPUT_MAX);
  /** 분석일 필터: N일 이내만 표시 (ANALYSIS_DAYS_MAX = MAX) */
  const [analysisWithin, setAnalysisWithin] = useState(ANALYSIS_DAYS_MAX);

  const [openMenu, setOpenMenu] = useState<FilterMenu>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPos | null>(null);

  const langTriggerRef = useRef<HTMLButtonElement>(null);
  const viewsTriggerRef = useRef<HTMLButtonElement>(null);
  const elapsedTriggerRef = useRef<HTMLButtonElement>(null);
  const analysisTriggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const languageOptions = useMemo(() => {
    const set = new Set(allRows.map((r) => r.language));
    return Array.from(set).sort();
  }, [allRows]);

  const placePopover = useCallback((menu: Exclude<FilterMenu, null>, el: HTMLElement | null) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const minW = menu === "views" ? 320 : menu === "elapsed" || menu === "analysisDate" ? 300 : 220;
    setPopoverPos({
      top: r.bottom + 6,
      left: clamp(r.left, 8, typeof window !== "undefined" ? window.innerWidth - minW - 8 : r.left),
      width: Math.max(minW, r.width),
    });
  }, []);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const openFilter = useCallback(
    (menu: Exclude<FilterMenu, null>, el: HTMLElement | null) => {
      if (openMenu === menu) {
        setOpenMenu(null);
        setPopoverPos(null);
        return;
      }
      placePopover(menu, el);
      setOpenMenu(menu);
    },
    [openMenu, placePopover]
  );

  useEffect(() => {
    if (!openMenu) return;
    const handler = () => {
      const ref =
        openMenu === "language"
          ? langTriggerRef.current
          : openMenu === "views"
            ? viewsTriggerRef.current
            : openMenu === "elapsed"
              ? elapsedTriggerRef.current
              : analysisTriggerRef.current;
      placePopover(openMenu, ref);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [openMenu, placePopover]);

  useEffect(() => {
    if (!openMenu) return;
    const el = scrollAreaRef.current;
    if (!el) return;
    function onScroll() {
      setOpenMenu(null);
      setPopoverPos(null);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (langTriggerRef.current?.contains(t)) return;
      if (viewsTriggerRef.current?.contains(t)) return;
      if (elapsedTriggerRef.current?.contains(t)) return;
      if (analysisTriggerRef.current?.contains(t)) return;
      setOpenMenu(null);
      setPopoverPos(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setPopoverPos(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openMenu]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const vminEff = clamp(viewsMin, 0, Number.MAX_SAFE_INTEGER);
    const vmaxEff = Number.isFinite(viewsMax) ? viewsMax : Number.POSITIVE_INFINITY;
    const dlow = clamp(Math.min(dMin, dMax), 0, D_PLUS_INPUT_MAX);
    const dhigh = clamp(Math.max(dMin, dMax), 0, D_PLUS_INPUT_MAX);

    let list: MockMozaicRow[] = allRows.filter((row) => {
      const textOk =
        !q ||
        row.title.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q) ||
        row.script.toLowerCase().includes(q) ||
        row.language.toLowerCase().includes(q) ||
        row.contentType.toLowerCase().includes(q) ||
        (row.createdAt ? formatDate(row.createdAt).toLowerCase().includes(q) : false);
      if (!textOk) return false;
      if (row.views < vminEff) return false;
      if (Number.isFinite(vmaxEff) && row.views > vmaxEff) return false;
      if (languageFilter !== "all" && row.language !== languageFilter) return false;
      const days = getUploadElapsedDays(row.date, asOf);
      if (days < dlow || days > dhigh) return false;
      if (analysisWithin < ANALYSIS_DAYS_MAX && row.createdAt) {
        const analysisAge = getUploadElapsedDays(row.createdAt, asOf);
        if (analysisAge > analysisWithin) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortKey === "views_desc" || sortKey === "views_asc") {
        const cmp = a.views - b.views;
        return sortKey === "views_desc" ? -cmp : cmp;
      }
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      const cmp = ta - tb;
      return sortKey === "date_desc" ? -cmp : cmp;
    });
    return list;
  }, [allRows, search, sortKey, viewsMin, viewsMax, languageFilter, dMin, dMax, analysisWithin, asOf]);

  const allVisibleIds = filteredSorted.map((r) => r.id);
  const allSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));

  function toggleRow(id: string) {
    commitSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      commitSelection((prev) => {
        const next = new Set(prev);
        allVisibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      commitSelection((prev) => {
        const next = new Set(prev);
        allVisibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  const vminEff = clamp(viewsMin, 0, Number.MAX_SAFE_INTEGER);
  const vmaxEff = Number.isFinite(viewsMax) ? viewsMax : Number.POSITIVE_INFINITY;
  /** 최대 슬라이더 표시값: 상한 없음이면 끝(350만)에 고정 */
  const maxSliderDisplay = Number.isFinite(viewsMax)
    ? Math.min(viewsMax, VIEWS_SLIDER_MAX)
    : VIEWS_SLIDER_MAX;
  const minSliderDisplay = clamp(viewsMin, 0, VIEWS_SLIDER_MAX);

  function setViewsMinSafe(v: number) {
    const x = clamp(v, 0, Number.MAX_SAFE_INTEGER);
    setViewsMin(x);
    setViewsMax((m) => {
      if (!Number.isFinite(m)) return m;
      return m < x ? x : m;
    });
  }

  function setViewsMaxSafe(v: number) {
    if (!Number.isFinite(v) || v >= VIEWS_SLIDER_MAX) {
      setViewsMax(Number.POSITIVE_INFINITY);
      return;
    }
    const x = clamp(v, 0, VIEWS_SLIDER_MAX);
    setViewsMax(x);
    setViewsMin((n) => (n > x ? x : n));
  }

  function onViewsMaxTextChange(raw: string) {
    const s = raw.trim().toLowerCase();
    if (s === "" || s === "max") {
      setViewsMax(Number.POSITIVE_INFINITY);
      return;
    }
    const n = parseNum(s, Number.NaN);
    if (!Number.isFinite(n)) return;
    if (n >= VIEWS_SLIDER_MAX) {
      setViewsMax(Number.POSITIVE_INFINITY);
      return;
    }
    setViewsMaxSafe(n);
  }

  const dlow = clamp(Math.min(dMin, dMax), 0, D_PLUS_INPUT_MAX);
  const dhigh = clamp(Math.max(dMin, dMax), 0, D_PLUS_INPUT_MAX);

  function setDMinSafe(v: number) {
    const x = clamp(Math.round(v), 0, D_PLUS_INPUT_MAX);
    setDMin(x);
    setDMax((m) => (m < x ? x : m));
  }

  function setDMaxSafe(v: number) {
    const x = clamp(Math.round(v), 0, D_PLUS_INPUT_MAX);
    setDMax(x);
    setDMin((n) => (n > x ? x : n));
  }

  const langActive = languageFilter !== "all";
  const viewsActive = vminEff > 0 || Number.isFinite(viewsMax);
  const dActive = dlow > 0 || dhigh < D_PLUS_INPUT_MAX;
  const analysisActive = analysisWithin < ANALYSIS_DAYS_MAX;

  const panel =
    openMenu && popoverPos ? (
      <div
        ref={panelRef}
        data-filter-panel
        className="fixed z-[200] rounded-xl border border-zinc-200 bg-white p-4 shadow-lg ring-1 ring-zinc-200/80"
        style={{
          top: popoverPos.top,
          left: popoverPos.left,
          width: popoverPos.width,
          maxWidth: "min(420px, calc(100vw - 16px))",
        }}
        role="dialog"
        aria-label={
          openMenu === "language" ? "플랫폼 필터" : openMenu === "views" ? "조회수 필터" : "업로드 경과 필터"
        }
      >
        {openMenu === "language" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-600">플랫폼 선택</p>
            <select
              className="input text-sm"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              aria-label="플랫폼 필터"
            >
              <option value="all">전체</option>
              {languageOptions.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn text-xs"
              onClick={() => setLanguageFilter("all")}
            >
              초기화
            </button>
          </div>
        )}

        {openMenu === "views" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-600">
              조회수 구간 · 슬라이더 끝(350만) = <span className="text-blue-600">MAX</span>(상한 없음)
            </p>
            <p className="font-mono-ui text-sm text-zinc-700">
              {formatViews(vminEff)} ~{" "}
              {Number.isFinite(vmaxEff) ? `${formatViews(vmaxEff)} 회` : "MAX (350만 이상 전체)"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] text-zinc-600">
                최소
                <input
                  type="range"
                  min={0}
                  max={VIEWS_SLIDER_MAX}
                  step={VIEWS_SLIDER_STEP}
                  value={minSliderDisplay}
                  onChange={(e) => setViewsMinSafe(Number(e.target.value))}
                  className="w-full accent-blue-600"
                  aria-label="조회수 하한 슬라이더"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  className="input font-mono-ui text-sm"
                  value={viewsMin}
                  onChange={(e) => setViewsMinSafe(parseNum(e.target.value, viewsMin))}
                  aria-label="조회수 하한 직접 입력"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-zinc-600">
                최대
                <input
                  type="range"
                  min={0}
                  max={VIEWS_SLIDER_MAX}
                  step={VIEWS_SLIDER_STEP}
                  value={maxSliderDisplay}
                  onChange={(e) => setViewsMaxSafe(Number(e.target.value))}
                  className="w-full accent-zinc-400"
                  aria-label="조회수 상한 슬라이더"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  className="input font-mono-ui text-sm"
                  value={Number.isFinite(viewsMax) ? viewsMax : "MAX"}
                  onChange={(e) => onViewsMaxTextChange(e.target.value)}
                  placeholder="숫자 또는 MAX"
                  aria-label="조회수 상한 직접 입력 (350만 이상은 MAX)"
                />
              </label>
            </div>
            <button
              type="button"
              className="btn text-xs"
              onClick={() => {
                setViewsMin(0);
                setViewsMax(Number.POSITIVE_INFINITY);
              }}
            >
              초기화
            </button>
          </div>
        )}

        {openMenu === "elapsed" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-600">
              업로드 경과 <span className="font-mono-ui text-zinc-800">D+</span> (0 ~ {D_PLUS_INPUT_MAX}일)
            </p>
            <p className="font-mono-ui text-sm text-zinc-700">
              D+{dlow} ~ D+{dhigh}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] text-zinc-600">
                하한
                <input
                  type="range"
                  min={0}
                  max={D_PLUS_INPUT_MAX}
                  step={1}
                  value={dlow}
                  onChange={(e) => setDMinSafe(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  className="input font-mono-ui text-sm"
                  value={dMin}
                  onChange={(e) => setDMinSafe(parseNum(e.target.value, dMin))}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-zinc-600">
                상한
                <input
                  type="range"
                  min={0}
                  max={D_PLUS_INPUT_MAX}
                  step={1}
                  value={dhigh}
                  onChange={(e) => setDMaxSafe(Number(e.target.value))}
                  className="w-full accent-zinc-400"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  className="input font-mono-ui text-sm"
                  value={dMax}
                  onChange={(e) => setDMaxSafe(parseNum(e.target.value, dMax))}
                />
              </label>
            </div>
            <button
              type="button"
              className="btn text-xs"
              onClick={() => {
                setDMin(0);
                setDMax(D_PLUS_INPUT_MAX);
              }}
            >
              초기화
            </button>
          </div>
        )}

        {openMenu === "analysisDate" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-600">
              분석일 — 최근 N일 이내
            </p>
            <p className="text-sm font-semibold text-zinc-800">
              {analysisWithin >= ANALYSIS_DAYS_MAX ? (
                <span className="text-blue-600">MAX (전체)</span>
              ) : (
                <span>{analysisWithin}일 이내</span>
              )}
            </p>
            <input
              type="range"
              min={1}
              max={ANALYSIS_DAYS_MAX}
              step={1}
              value={analysisWithin}
              onChange={(e) => setAnalysisWithin(Number(e.target.value))}
              className="w-full accent-blue-600"
              aria-label="분석일 N일 이내 필터"
            />
            <div className="flex justify-between text-[10px] text-zinc-400">
              <span>1일</span>
              <span>50일</span>
              <span className="text-blue-500">100일 (MAX)</span>
            </div>
            <button
              type="button"
              className="btn text-xs"
              onClick={() => setAnalysisWithin(ANALYSIS_DAYS_MAX)}
            >
              초기화
            </button>
          </div>
        )}
      </div>
    ) : null;

  return (
    <section className="card overflow-hidden p-5">
      {panel}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Mock 데이터 테이블</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Mozaic API 데이터 ·{" "}
            <span className="text-zinc-800">플랫폼 / 조회수 / 업로드 경과</span> 열 제목을 누르면 필터 · 검색·정렬과
            함께 AND 적용
          </p>
          {showOptimizeFieldToggles && (
            <p className="mt-2 text-xs text-zinc-600">
              열 이름 옆 <span className="text-blue-600">체크</span>는{" "}
              <span className="text-zinc-800">W 최적화 실행</span> 시 히스토리 문자열에 포함할 항목입니다.
              체크 해제 시 해당 열은 최적화 입력에서 빠집니다.
            </p>
          )}
          {subtitleExtra}
        </div>
        <p className="text-sm text-zinc-800">
          선택됨: <span className="font-semibold text-zinc-900">{selected.size}</span>건
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-zinc-600">
          검색
          <input
            className="input text-sm"
            placeholder="제목·proxy·스크립트·플랫폼·콘텐츠 타입 검색…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Mock 데이터 검색"
          />
        </label>
        <label className="flex min-w-[200px] flex-col gap-1 text-xs text-zinc-600">
          정렬
          <select
            className="input text-sm"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="정렬 기준"
          >
            <option value="views_desc">조회수 · 높은 순</option>
            <option value="views_asc">조회수 · 낮은 순</option>
            <option value="date_desc">날짜 · 최신 순</option>
            <option value="date_asc">날짜 · 오래된 순</option>
          </select>
        </label>
      </div>

      <div ref={scrollAreaRef} className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead className="bg-zinc-100 text-zinc-700">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  className="checkbox-mozaic checkbox-mozaic-md"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="현재 목록 전체 선택"
                />
              </th>
              <th className="px-3 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <OptimizeFieldToggle
                    field="title"
                    show={showOptimizeFieldToggles}
                    include={optimizeFieldInclude}
                    onChange={onOptimizeFieldIncludeChange}
                  />
                  <span>제목</span>
                </div>
              </th>
              <th className="px-3 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <OptimizeFieldToggle
                    field="description"
                    show={showOptimizeFieldToggles}
                    include={optimizeFieldInclude}
                    onChange={onOptimizeFieldIncludeChange}
                  />
                  <span>proxy</span>
                </div>
              </th>
              <th className="px-3 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <OptimizeFieldToggle
                    field="script"
                    show={showOptimizeFieldToggles}
                    include={optimizeFieldInclude}
                    onChange={onOptimizeFieldIncludeChange}
                  />
                  <span>스크립트</span>
                </div>
              </th>
              <th className="whitespace-nowrap px-2 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <OptimizeFieldToggle
                    field="language"
                    show={showOptimizeFieldToggles}
                    include={optimizeFieldInclude}
                    onChange={onOptimizeFieldIncludeChange}
                  />
                  <button
                    ref={langTriggerRef}
                    type="button"
                    data-filter-trigger
                    onClick={() => openFilter("language", langTriggerRef.current)}
                    className={`inline-flex max-w-full items-center rounded-md px-1 py-0.5 text-left transition hover:bg-zinc-100 hover:text-zinc-900 ${
                      langActive ? "text-zinc-900" : ""
                    }`}
                    aria-expanded={openMenu === "language"}
                  >
                    플랫폼
                    <FilterDot on={langActive} />
                    <span className="ml-0.5 text-[10px] text-zinc-600" aria-hidden>
                      ▾
                    </span>
                  </button>
                </div>
              </th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <OptimizeFieldToggle
                    field="contentType"
                    show={showOptimizeFieldToggles}
                    include={optimizeFieldInclude}
                    onChange={onOptimizeFieldIncludeChange}
                  />
                  <span>콘텐츠 타입</span>
                </div>
              </th>
              <th className="whitespace-nowrap px-2 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <OptimizeFieldToggle
                    field="views"
                    show={showOptimizeFieldToggles}
                    include={optimizeFieldInclude}
                    onChange={onOptimizeFieldIncludeChange}
                  />
                  <button
                    ref={viewsTriggerRef}
                    type="button"
                    data-filter-trigger
                    onClick={() => openFilter("views", viewsTriggerRef.current)}
                    className={`inline-flex max-w-full items-center rounded-md px-1 py-0.5 text-left transition hover:bg-zinc-100 hover:text-zinc-900 ${
                      viewsActive ? "text-zinc-900" : ""
                    }`}
                    aria-expanded={openMenu === "views"}
                  >
                    조회수
                    <FilterDot on={viewsActive} />
                    <span className="ml-0.5 text-[10px] text-zinc-600" aria-hidden>
                      ▾
                    </span>
                  </button>
                </div>
              </th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <OptimizeFieldToggle
                    field="likes"
                    show={showOptimizeFieldToggles}
                    include={optimizeFieldInclude}
                    onChange={onOptimizeFieldIncludeChange}
                  />
                  <span>좋아요</span>
                </div>
              </th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <OptimizeFieldToggle
                    field="likeRatio"
                    show={showOptimizeFieldToggles}
                    include={optimizeFieldInclude}
                    onChange={onOptimizeFieldIncludeChange}
                  />
                  <span>좋아요율</span>
                </div>
              </th>
              <th className="whitespace-nowrap px-2 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <OptimizeFieldToggle
                    field="elapsed"
                    show={showOptimizeFieldToggles}
                    include={optimizeFieldInclude}
                    onChange={onOptimizeFieldIncludeChange}
                  />
                  <button
                    ref={elapsedTriggerRef}
                    type="button"
                    data-filter-trigger
                    onClick={() => openFilter("elapsed", elapsedTriggerRef.current)}
                    className={`inline-flex max-w-full items-center rounded-md px-1 py-0.5 text-left transition hover:bg-zinc-100 hover:text-zinc-900 ${
                      dActive ? "text-zinc-900" : ""
                    }`}
                    aria-expanded={openMenu === "elapsed"}
                  >
                    업로드 경과
                    <FilterDot on={dActive} />
                    <span className="ml-0.5 text-[10px] text-zinc-600" aria-hidden>
                      ▾
                    </span>
                  </button>
                </div>
              </th>
              <th className="whitespace-nowrap px-2 py-3 font-medium">
                <div className="flex items-center gap-2">
                  <OptimizeFieldToggle
                    field="createdAt"
                    show={showOptimizeFieldToggles}
                    include={optimizeFieldInclude}
                    onChange={onOptimizeFieldIncludeChange}
                  />
                  <button
                    ref={analysisTriggerRef}
                    type="button"
                    data-filter-trigger
                    onClick={() => openFilter("analysisDate", analysisTriggerRef.current)}
                    className={`inline-flex max-w-full items-center rounded-md px-1 py-0.5 text-left transition hover:bg-zinc-100 hover:text-zinc-900 ${
                      analysisActive ? "text-zinc-900" : ""
                    }`}
                    aria-expanded={openMenu === "analysisDate"}
                  >
                    분석일
                    <FilterDot on={analysisActive} />
                    <span className="ml-0.5 text-[10px] text-zinc-600" aria-hidden>
                      ▾
                    </span>
                  </button>
                </div>
              </th>
            </tr>
            {showOptimizeFieldToggles && optimizeFieldInclude && onOptimizeFieldIncludeChange && (
              <tr className="border-t border-zinc-200 bg-zinc-50">
                <th colSpan={12} className="px-3 py-2 text-left text-xs font-normal text-zinc-600">
                  <span className="mr-3 text-zinc-600">Supabase 행 직렬화 시 포함 (DB 전용):</span>
                  <label className="mr-4 inline-flex cursor-pointer items-center gap-2 text-zinc-800">
                    <input
                      type="checkbox"
                      className="checkbox-mozaic checkbox-mozaic-sm"
                      checked={optimizeFieldInclude.hookScore}
                      onChange={(e) => onOptimizeFieldIncludeChange("hookScore", e.target.checked)}
                    />
                    훅점수
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-800">
                    <input
                      type="checkbox"
                      className="checkbox-mozaic checkbox-mozaic-sm"
                      checked={optimizeFieldInclude.verdict}
                      onChange={(e) => onOptimizeFieldIncludeChange("verdict", e.target.checked)}
                    />
                    판정
                  </label>
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {filteredSorted.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-zinc-600">
                  검색 결과가 없습니다.
                </td>
              </tr>
            ) : (
              filteredSorted.map((row) => (
                <tr
                  key={row.id}
                  className={`border-t border-zinc-200 text-zinc-800 transition ${
                    selected.has(row.id) ? "bg-zinc-100" : "hover:bg-zinc-50"
                  }`}
                >
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      className="checkbox-mozaic checkbox-mozaic-md"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`${row.title} 선택`}
                    />
                  </td>
                  <td className="max-w-[140px] px-3 py-2 align-top font-medium text-zinc-900">
                    <div className="line-clamp-2">{row.title}</div>
                  </td>
                  <td className="max-w-[200px] px-3 py-2 align-top text-zinc-600">
                    <div className="line-clamp-2">{row.description}</div>
                  </td>
                  <td className="max-w-[180px] px-3 py-2 align-top text-sm text-zinc-600">
                    <div className="line-clamp-2">{row.script}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-zinc-700">{row.language}</td>
                  <td className="max-w-[120px] px-3 py-2 align-top">
                    <div className="line-clamp-2 text-[11px]">{row.contentType}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top font-mono-ui text-zinc-700">
                    {formatViews(row.views)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top font-mono-ui text-zinc-700">
                    {formatViews(row.likes)}
                  </td>
                  <td
                    className="whitespace-nowrap px-3 py-2 align-top font-mono-ui text-blue-700"
                    title={`좋아요 ${row.likes} / 조회 ${row.views}`}
                  >
                    {formatLikeRatio(row.likes, row.views)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top font-mono-ui text-zinc-600">
                    {formatUploadDayPlus(row.date, asOf)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-zinc-500">
                    {row.createdAt ? formatDate(row.createdAt) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footerSlot}
    </section>
  );
}
