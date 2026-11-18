/** A text box for tags: space-separated, with "quoted phrases". */
export function TagInput({ name = "tags", defaultValue = "", label = "Tags" }: { name?: string; defaultValue?: string; label?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input name={name} defaultValue={defaultValue} className="input" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder='oer "open education"' />
      <span className="hint">Separate tags with spaces. Use &quot;quotes&quot; for a phrase.</span>
    </label>
  );
}
