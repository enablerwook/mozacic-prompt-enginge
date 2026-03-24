export function safeParse<T>(raw: string): T | null {
  if (!raw) return null;

  let text = raw.trim();

  // 코드 블록 제거
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // [{…}] 배열 또는 {…} 객체 범위 추출 — 먼저 나오는 쪽 기준으로 선택
  const arrFirst = text.indexOf("[");
  const arrLast  = text.lastIndexOf("]");
  const objFirst = text.indexOf("{");
  const objLast  = text.lastIndexOf("}");

  const hasArr = arrFirst >= 0 && arrLast > arrFirst;
  const hasObj = objFirst >= 0 && objLast > objFirst;

  if (hasArr && (!hasObj || arrFirst < objFirst)) {
    text = text.slice(arrFirst, arrLast + 1);
  } else if (hasObj) {
    text = text.slice(objFirst, objLast + 1);
  }

  // trailing comma 제거
  text = text.replace(/,\s*([}\]])/g, "$1");

  // 1차: 그대로 파싱
  try {
    return JSON.parse(text) as T;
  } catch {
    // 2차: JSON string value 내부의 리터럴 줄바꿈을 \n으로 이스케이프 후 재시도
    // "..." 안의 실제 newline/CR을 이스케이프된 \\n/\\r로 치환
    try {
      const escaped = text.replace(/"((?:[^"\\]|\\.)*)"/gs, (match) =>
        match
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t")
      );
      return JSON.parse(escaped) as T;
    } catch {
      return null;
    }
  }
}
