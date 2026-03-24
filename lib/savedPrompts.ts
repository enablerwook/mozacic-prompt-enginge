export const SAVED_PROMPTS_KEY = "mozaic:savedPrompts";
export const MAX_SAVED_PROMPTS = 20;

export type SavedPrompt = {
  id: string;
  name: string;
  prompt: string;
  savedAt: string; // ISO
};

export function loadSavedPrompts(): SavedPrompt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_PROMPTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedPrompt[];
  } catch {
    return [];
  }
}

export function savePrompt(name: string, prompt: string): SavedPrompt[] {
  const list = loadSavedPrompts();
  const entry: SavedPrompt = {
    id: `sp_${Date.now()}`,
    name: name.trim() || `W_${new Date().toLocaleString("ko-KR")}`,
    prompt,
    savedAt: new Date().toISOString(),
  };
  const next = [entry, ...list].slice(0, MAX_SAVED_PROMPTS);
  localStorage.setItem(SAVED_PROMPTS_KEY, JSON.stringify(next));
  return next;
}

export function deletePrompt(id: string): SavedPrompt[] {
  const next = loadSavedPrompts().filter((p) => p.id !== id);
  localStorage.setItem(SAVED_PROMPTS_KEY, JSON.stringify(next));
  return next;
}
