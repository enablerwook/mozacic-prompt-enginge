/** UI 데모용 가짜 데이터 (실제 API와 무관) */
export type MockMozaicRow = {
  id: string;
  title: string;
  /** proxy 데이터(기존 설명 슬롯) */
  description: string;
  /** 영상 대본 요약 */
  script: string;
  /** 표시용 언어 라벨 (예: Korean, English) */
  language: string;
  /** 콘텐츠 타입 (예: Shorts, Tutorial, Vlog) */
  contentType: string;
  views: number;
  likes: number;
  /** 업로드 시각 (ISO) — D+N 계산 기준일 */
  date: string;
};

export const mockMozaicData: MockMozaicRow[] = [
  {
    id: "m1",
    title: "첫 3초 훅 테스트",
    description: "강렬한 오프닝 + 자막 대비로 시청 지속률 상승한 쇼츠",
    script: "[0s] 잠깐만! 이거 모르면 손해… [1s] 오늘은 3초 안에 시청자 붙잡는 법",
    language: "Korean",
    contentType: "Shorts",
    views: 128_400,
    likes: 4_820,
    date: "2025-02-01T09:00:00.000Z",
  },
  {
    id: "m2",
    title: "브이로그 톤 다운",
    description: "일상 브이로그, 배경음악 낮추고 나레이션 위주 편집",
    script: "아침에 일어나서 커피 한 잔. 오늘은 말을 천천히, 배경은 조용하게.",
    language: "Korean",
    contentType: "Vlog",
    views: 45_200,
    likes: 1_120,
    date: "2025-02-14T11:30:00.000Z",
  },
  {
    id: "m3",
    title: "튜토리얼 파트 2",
    description: "코딩 튜토리얼 — 단계별 자막과 줌 인으로 이해도 개선",
    script: "먼저 터미널을 엽니다. 다음 줄 그대로 복붙하세요. 에러 나오면 여기서 멈춰 주세요.",
    language: "Korean",
    contentType: "Tutorial",
    views: 302_900,
    likes: 9_400,
    date: "2025-01-20T18:15:00.000Z",
  },
  {
    id: "m4",
    title: "리액션 쇼츠",
    description: "트렌드 영상 리액션, 썸네일 문구와 첫 대사 일치 실험",
    script: "Wait— did you see that cut? Okay rewind. This is exactly what I mean.",
    language: "English",
    contentType: "Shorts",
    views: 89_000,
    likes: 2_650,
    date: "2025-03-01T08:00:00.000Z",
  },
  {
    id: "m5",
    title: "제품 언박싱",
    description: "언박싱 + 한 줄 결론 먼저 말하기로 이탈률 감소 시도",
    script: "결론부터: 이 가격이면 살 만합니다. 박스 열어볼게요— 첫 느낌은 가볍고 질감은…",
    language: "English",
    contentType: "Tutorial",
    views: 56_700,
    likes: 1_980,
    date: "2025-03-10T14:45:00.000Z",
  },
];

/** 업로드일(로컬 자정 기준)부터 기준일까지 경과한 일수 */
export function getUploadElapsedDays(uploadIso: string, now: Date = new Date()): number {
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const uploadStart = startOfDay(new Date(uploadIso));
  const todayStart = startOfDay(now);
  const msDay = 86_400_000;
  return Math.max(0, Math.round((todayStart - uploadStart) / msDay));
}

/** 업로드일부터의 경과 일수 → D+3 형식 문자열 */
export function formatUploadDayPlus(uploadIso: string, now: Date = new Date()): string {
  return `D+${getUploadElapsedDays(uploadIso, now)}`;
}

export const MOCK_BASE_W = `당신은 숏폼 영상의 첫 3초 훅을 분석한다.
입력: 영상 설명 텍스트.
출력: 위협/손실/불확실성 점수와 한 줄 판정.`;

export const MOCK_NEW_W = `당신은 숏폼 영상의 첫 3초 훅을 분석한다.
입력: 영상 설명 텍스트 + (선택) 조회수 맥락.
출력: 위협/손실/불확실성 점수, R/E 요약, 한 줄 판정과 개선 팁.`;
