import { ActionForm, Field, SubmitButton } from "@/components/form";
import { TagInput } from "@/components/tag-input";
import { fetchPageTitle } from "@/domain/bookmarks/repo";
import { firstParam, type SearchParams } from "@/lib/params";
import { requireUser } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { saveLinkAction } from "./actions";

export const metadata = { title: "Save a link" };

export default async function SavePage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const sp = await searchParams;
  const url = (firstParam(sp.u) ?? "").slice(0, 2000);
  let title = (firstParam(sp.t) ?? "").slice(0, 300);
  if (url && !title) title = (await fetchPageTitle(url)) ?? "";
  const bookmarklet =
    `javascript:location.href='${siteOrigin()}/save?u='+encodeURIComponent(location.href)+'&t='+encodeURIComponent(document.title)`
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="h1 mb-6">Save a link</h1>
      <ActionForm action={saveLinkAction}>
        <Field label="Address" name="url" type="text" inputMode="url" required defaultValue={url} placeholder="https://" />
        <Field label="Title" name="title" defaultValue={title} maxLength={300} />
        <TagInput />
        <label className="block">
          <span className="label">Note (optional)</span>
          <textarea name="comment" rows={3} maxLength={2000} className="input" />
          <span className="hint">Only you can see your note.</span>
        </label>
        <SubmitButton>Save</SubmitButton>
      </ActionForm>
      <section className="card mt-10 text-sm">
        <h2 className="mb-1 font-semibold">Save from anywhere</h2>
        <p className="text-muted">
          Drag this button to your bookmarks bar, then click it on any page to save that page here:
        </p>
        {/* A javascript: link cannot be written as a React href; the string is built from our own origin only. */}
        <p className="mt-3" dangerouslySetInnerHTML={{ __html: `<a class="btn" href="${bookmarklet}">Save to Ozmozr</a>` }} />
      </section>
    </div>
  );
}
