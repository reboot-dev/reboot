// Date helpers shared by the web app, the MCP Apps and the mobile app.
// The backend does all the Hebrew calendar arithmetic; these only say
// what "today" is for the person looking, and render the Gregorian
// dates it returns (always `YYYY-MM-DD`) for people to read.

// The Hebrew months by name, as the backend accepts them, in the
// order of the year from Tishrei (when the year number changes).
export const HEBREW_MONTHS = [
  "Tishrei",
  "Cheshvan",
  "Kislev",
  "Tevet",
  "Shevat",
  "Adar",
  "Adar I",
  "Adar II",
  "Nisan",
  "Iyar",
  "Sivan",
  "Tammuz",
  "Av",
  "Elul",
];

const pad = (n: number) => String(n).padStart(2, "0");

// Today's date where the viewer is, as `YYYY-MM-DD`, which is what
// the backend counts upcoming birthdays from. Not UTC: a birthday is
// "today" by the viewer's own calendar.
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;
}

// Parses a `YYYY-MM-DD` as a local calendar date, so that formatting
// it never slides a day across a time zone the way `new Date(iso)`,
// which reads it as UTC midnight, would.
function parse(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// For example "Mon, Nov 9, 2026".
export function formatGregorian(iso: string): string {
  if (iso === "") {
    return "";
  }
  return parse(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// The Hebrew day begins at sunset, so a birthday whose daytime is
// `iso` begins on the evening before it; for example "Sun, Nov 8".
export function eveningBefore(iso: string): string {
  const date = parse(iso);
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// How far away a birthday is, for people: "Today!", "Tomorrow",
// "in 17 days".
export function whenText(daysUntil: number): string {
  if (daysUntil <= 0) {
    return "Today!";
  }
  if (daysUntil === 1) {
    return "Tomorrow";
  }
  return `in ${daysUntil} days`;
}
