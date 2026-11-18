import type { EventItem } from "./repo";

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function utc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Folds a content line so no line is longer than 75 bytes (RFC 5545 §3.1). */
function fold(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > 75) {
      out.push(current);
      current = " ";
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out;
}

function vevent(lines: string[]): string[] {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
}

/**
 * Renders events as an iCalendar file. A conference's register-by and
 * submit-by dates each become an extra all-day event.
 */
export function renderIcal(events: readonly EventItem[], calendarName: string, now: Date = new Date()): string {
  const stamp = `DTSTAMP:${utc(now)}`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ozmozr//Events//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const event of events) {
    const details = [event.description, event.conference?.theme ? `Theme: ${event.conference.theme}` : ""].filter(Boolean).join("\n");
    lines.push(
      ...vevent([
        `UID:event-${event.id}@ozmozr`,
        stamp,
        `DTSTART:${utc(event.startsAt)}`,
        ...(event.endsAt ? [`DTEND:${utc(event.endsAt)}`] : []),
        `SUMMARY:${escapeText(event.name)}`,
        ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
        `URL:${event.url}`,
        ...(details ? [`DESCRIPTION:${escapeText(details)}`] : []),
      ]),
    );
    const deadlines: [string, string, Date | null | undefined][] = [
      ["register", "Register by", event.conference?.registerBy],
      ["submit", "Submit by", event.conference?.submitBy],
    ];
    for (const [key, label, when] of deadlines) {
      if (!when) continue;
      lines.push(
        ...vevent([
          `UID:event-${event.id}-${key}@ozmozr`,
          stamp,
          `DTSTART;VALUE=DATE:${day(when)}`,
          `SUMMARY:${escapeText(`${label}: ${event.name}`)}`,
          `URL:${event.url}`,
        ]),
      );
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.flatMap(fold).join("\r\n")}\r\n`;
}
