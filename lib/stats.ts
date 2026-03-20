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

export function correlationLabel(corr: number | null) {
  if (corr === null) return "데이터 부족";
  return Math.abs(corr) >= 0.5 ? "W가 잘 작동" : "W 개선 필요";
}
