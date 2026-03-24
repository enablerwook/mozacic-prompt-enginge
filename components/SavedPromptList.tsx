"use client";

import { useRef, useState } from "react";
import type { SavedPrompt } from "@/lib/savedPrompts";

type Props = {
  prompts: SavedPrompt[];
  onLoad: (p: SavedPrompt) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
};

export default function SavedPromptList({ prompts, onLoad, onDelete, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(p: SavedPrompt) {
    setEditingId(p.id);
    setEditValue(p.name);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit(id: string) {
    if (editValue.trim()) onRename(id, editValue);
    setEditingId(null);
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") commitEdit(id);
    if (e.key === "Escape") setEditingId(null);
  }

  if (prompts.length === 0) {
    return <p className="px-4 py-4 text-sm text-zinc-500">저장된 프롬프트가 없습니다.</p>;
  }

  return (
    <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto">
      {prompts.map((p) => (
        <li key={p.id} className="flex items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            {editingId === p.id ? (
              <input
                ref={inputRef}
                className="input w-full text-sm"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitEdit(p.id)}
                onKeyDown={(e) => handleKeyDown(e, p.id)}
                autoFocus
              />
            ) : (
              <p
                className="truncate text-sm font-medium text-zinc-800 cursor-text hover:text-zinc-600"
                title="클릭해서 이름 수정"
                onClick={() => startEdit(p)}
              >
                {p.name}
              </p>
            )}
            <p className="truncate text-xs text-zinc-400">
              {new Date(p.savedAt).toLocaleString("ko-KR")} · {p.prompt.length}자
            </p>
          </div>
          {editingId === p.id ? (
            <button
              type="button"
              className="btn text-xs"
              onClick={() => commitEdit(p.id)}
            >
              저장
            </button>
          ) : (
            <button
              type="button"
              className="btn text-xs"
              onClick={() => onLoad(p)}
            >
              불러오기
            </button>
          )}
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-200 hover:text-red-600 transition"
            onClick={() => onDelete(p.id)}
            aria-label="삭제"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
