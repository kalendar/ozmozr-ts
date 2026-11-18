"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormState } from "./form";

/** Tag box with one-click suggestions. */
export function TagEditor({
  action,
  hidden,
  initial,
  suggestions,
  label = "Your tags",
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  hidden: Record<string, string | number>;
  initial: string;
  suggestions: { label: string; tags: string[] }[];
  label?: string;
}) {
  const [value, setValue] = useState(initial);
  const add = (tag: string) => {
    const token = /[\s,]/.test(tag) ? `"${tag}"` : tag;
    setValue((v) => (v.toLowerCase().includes(token.toLowerCase()) ? v : `${v.trim()} ${token}`.trim()));
  };
  return (
    <ActionForm action={action} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="block">
        <span className="label">{label}</span>
        <input name="tags" value={value} onChange={(e) => setValue(e.target.value)} className="input" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        <span className="hint">Separate tags with spaces. Use &quot;quotes&quot; for a phrase.</span>
      </label>
      {suggestions.filter((s) => s.tags.length > 0).map((s) => (
        <p key={s.label} className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {s.label}
          {s.tags.map((tag) => (
            <button key={tag} type="button" className="tag cursor-pointer" onClick={() => add(tag)}>{tag}</button>
          ))}
        </p>
      ))}
      <SubmitButton className="btn">Save tags</SubmitButton>
    </ActionForm>
  );
}
