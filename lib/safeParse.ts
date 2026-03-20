export function safeParse<T>(raw: string): T | null {
  if (!raw) return null;

  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    text = text.slice(first, last + 1);
  }

  text = text.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
