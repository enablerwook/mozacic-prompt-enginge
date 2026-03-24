import { supabase } from "@/lib/supabase";

export type SavedPrompt = {
  id: string;
  name: string;
  prompt: string;
  savedAt: string; // ISO
};

export async function loadSavedPrompts(): Promise<SavedPrompt[]> {
  const { data, error } = await supabase
    .from("saved_prompts")
    .select("id, name, prompt, saved_at")
    .order("saved_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    prompt: String(r.prompt),
    savedAt: String(r.saved_at),
  }));
}

export async function savePrompt(name: string, prompt: string): Promise<SavedPrompt[]> {
  const entryName = name.trim() || `W_${new Date().toLocaleString("ko-KR")}`;
  const { error } = await supabase
    .from("saved_prompts")
    .insert({ name: entryName, prompt });
  if (error) throw new Error(error.message);
  return loadSavedPrompts();
}

export async function deletePrompt(id: string): Promise<SavedPrompt[]> {
  const { error } = await supabase
    .from("saved_prompts")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
  return loadSavedPrompts();
}

export async function renamePrompt(id: string, newName: string): Promise<SavedPrompt[]> {
  const trimmed = newName.trim();
  if (!trimmed) return loadSavedPrompts();
  const { error } = await supabase
    .from("saved_prompts")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return loadSavedPrompts();
}
