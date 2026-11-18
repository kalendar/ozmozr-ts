import { ActionForm, SubmitButton } from "@/components/form";
import { requireUser } from "@/lib/session";
import { importOpmlAction } from "../actions";

export const metadata = { title: "Import feeds" };

export default async function ImportPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="h1 mb-2">Import feeds</h1>
      <p className="mb-6 text-sm text-muted">
        Upload an OPML file exported from another feed reader. Folder names become tags. Up to 500 feeds per file.
      </p>
      <ActionForm action={importOpmlAction}>
        <label className="block">
          <span className="label">OPML file</span>
          <input type="file" name="file" accept=".opml,.xml,text/xml,text/x-opml,application/xml" required className="input" />
        </label>
        <SubmitButton>Import</SubmitButton>
      </ActionForm>
    </div>
  );
}
