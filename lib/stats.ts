export function pearsonCorrelation(x: number[], y: number[]) {
  if (x.length !== y.length || x.length < 3) return null;

  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

// 동점(tie) 처리: 같은 값에 평균 순위 부여
function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j - 1) / 2;
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

/**
 * 스피어만 순위 상관계수
 * 피어슨보다 강건함: 원시값 대신 순위를 비교하므로
 * 분포가 편향되거나 점수 분산이 낮아도 유효한 값을 반환.
 * null은 n < 3이거나 모든 값이 완전히 동일할 때만 발생.
 */
export function spearmanCorrelation(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  return pearsonCorrelation(rankArray(x), rankArray(y));
}

export function correlationLabel(corr: number | null) {
  if (corr === null) return "데이터 부족";
  return Math.abs(corr) >= 0.5 ? "W가 잘 작동" : "W 개선 필요";
}
