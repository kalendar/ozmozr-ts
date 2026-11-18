import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Avatar } from "@/components/person-card";
import { getDb } from "@/db/client";
import { getProfileByUserId } from "@/domain/people/profiles";
import { requireUser } from "@/lib/session";
import { updateProfileAction } from "../people/actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getProfileByUserId(getDb(), user.id);
  if (!profile) return null;
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="h1 mb-6">Your profile</h1>
      <ActionForm action={updateProfileAction}>
        <div className="flex items-center gap-4">
          <Avatar path={profile.avatar_path} name={profile.display_name} size={64} />
          <label className="block flex-1">
            <span className="label">Picture</span>
            <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" className="input" />
            <span className="hint">JPEG, PNG or WebP, up to 5 MB.</span>
          </label>
        </div>
        <Field label="Display name" name="displayName" defaultValue={profile.display_name} required maxLength={80} />
        <label className="block">
          <span className="label">About you</span>
          <textarea name="blurb" rows={4} maxLength={2000} defaultValue={profile.blurb} className="input" />
        </label>
        <Field label="Location" name="location" defaultValue={profile.location} maxLength={100} />
        <Field label="Website" name="website" type="text" inputMode="url" defaultValue={profile.website} placeholder="https://" />
        <SubmitButton>Save profile</SubmitButton>
      </ActionForm>
      <p className="mt-8 text-sm text-muted">Your handle is @{profile.handle} and cannot be changed.</p>
    </div>
  );
}
