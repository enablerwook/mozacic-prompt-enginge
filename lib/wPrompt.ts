export const W_PROMPT_STORAGE_KEY = "mozaic:wPrompt";
export const W_VERSION_STORAGE_KEY = "mozaic:wVersion";

export function toSubscript(num: number) {
  const map: Record<string, string> = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
  };
  return String(num)
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
}
