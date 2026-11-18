import { ActionForm, SubmitButton, type FormState } from "./form";

/** Checkboxes for who to share with, plus a note. */
export function ShareForm({
  action,
  entryId,
  legend,
  name,
  options,
  already,
  submitLabel,
  emptyText,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  entryId: number;
  legend: string;
  name: string;
  options: { value: string | number; label: string }[];
  already: (string | number)[];
  submitLabel: string;
  emptyText: string;
}) {
  if (options.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="entryId" value={entryId} />
      <fieldset>
        <legend className="label">{legend}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name={name} value={o.value} />
              {o.label}
              {already.includes(o.value) && <span className="text-xs text-muted">(shared)</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="label">Note (optional)</span>
        <input name="comment" maxLength={2000} className="input" />
      </label>
      <SubmitButton className="btn">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
