import Link from "next/link";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { TagInput } from "@/components/tag-input";
import { requireUser } from "@/lib/session";
import { addFeed } from "../actions";

export const metadata = { title: "Add a feed" };

export default async function AddFeedPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="h1 mb-2">Add a feed</h1>
      <p className="mb-6 text-sm text-muted">
        Paste a feed address, or the address of a site and we will look for its feed. Have a list already?{" "}
        <Link href="/feeds/import" className="link">Import an OPML file</Link>.
      </p>
      <ActionForm action={addFeed}>
        <Field label="Address" name="url" type="text" inputMode="url" required placeholder="https://example.org/feed.xml" />
        <Field label="Your name for it (optional)" name="title" maxLength={300} />
        <TagInput />
        <SubmitButton>Subscribe</SubmitButton>
      </ActionForm>
    </div>
  );
}
