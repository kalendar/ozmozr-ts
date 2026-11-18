import { ActionForm, Field, SubmitButton } from "@/components/form";
import type { EventItem } from "@/domain/events/repo";
import { setConferenceAction } from "./actions";

const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const inputDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export function EventsPanel({ events, calendarHref }: { events: EventItem[]; calendarHref: string }) {
  return (
    <section className="card" aria-labelledby="events-heading">
      <h2 id="events-heading" className="mb-2 text-sm font-semibold">Upcoming events</h2>
      {events.length === 0 ? (
        <p className="text-xs text-muted">Events found on pages you save will show up here.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id} className="text-sm">
              <a href={event.url} target="_blank" rel="noopener nofollow ugc" className="link font-medium">{event.name}</a>
              <p className="text-xs text-muted">
                <time dateTime={event.startsAt.toISOString()}>{when.format(event.startsAt)} UTC</time>
                {event.location && <> · {event.location}</>}
              </p>
              {event.conference && (
                <p className="mt-0.5 text-xs">
                  <span className="tag">Conference</span>
                  {event.conference.theme && <> Theme: {event.conference.theme}.</>}
                  {event.conference.registerBy && <> Register by {dayOnly.format(event.conference.registerBy)}.</>}
                  {event.conference.submitBy && <> Submit by {dayOnly.format(event.conference.submitBy)}.</>}
                </p>
              )}
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-muted hover:text-ink">Conference details</summary>
                <ActionForm action={setConferenceAction} className="mt-2 space-y-2">
                  <input type="hidden" name="eventId" value={event.id} />
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" name="isConference" defaultChecked={event.conference !== null} /> This is a conference
                  </label>
                  <Field label="Theme" name="theme" maxLength={300} defaultValue={event.conference?.theme ?? ""} />
                  <Field label="Register by" name="registerBy" type="date" defaultValue={inputDate(event.conference?.registerBy)} />
                  <Field label="Submit by" name="submitBy" type="date" defaultValue={inputDate(event.conference?.submitBy)} />
                  <SubmitButton className="btn">Save details</SubmitButton>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs">
        <a className="link" href={calendarHref}>Subscribe in your calendar (iCal)</a>
      </p>
    </section>
  );
}
