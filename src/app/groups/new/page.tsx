import { ActionForm, Field, SubmitButton } from "@/components/form";
import { requireUser } from "@/lib/session";
import { createGroupAction } from "../../g/actions";

export const metadata = { title: "Start a group" };

export default async function NewGroupPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="h1 mb-6">Start a group</h1>
      <ActionForm action={createGroupAction}>
        <Field label="Name" name="title" required maxLength={100} />
        <Field label="Address" name="slug" required pattern="[a-z0-9\-]{3,40}" hint="Lowercase letters, numbers and hyphens. The group will live at /g/your-address." />
        <label className="block">
          <span className="label">What is it for?</span>
          <textarea name="description" rows={4} required maxLength={3000} className="input" />
        </label>
        <label className="block">
          <span className="label">Picture (optional)</span>
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="input" />
        </label>
        <SubmitButton>Create group</SubmitButton>
      </ActionForm>
    </div>
  );
}
