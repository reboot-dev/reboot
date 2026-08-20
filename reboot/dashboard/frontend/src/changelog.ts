// What the dashboard noticed changing in the developer's API files,
// and how to read it.
//
// Written by `changelog.py` and stored in an `OrderedMap` keyed by a
// uuidv7, so the keys are in the order the changes happened and a
// reverse range is newest first. As with the description, the shape
// is written down once here and a test parses the real thing through
// it.
import { z } from "zod";

// What moved inside a type that changed: a method or a field, and
// whether it appeared, went away, or is simply not what it was.
const MovedSchema = z.object({
  name: z.string(),
  change: z.enum(["added", "changed", "removed"]),
  // What the part is, said by whatever declared it: a state type's
  // methods, a data type's properties, or a state type's own state.
  part: z.enum(["method", "property", "state"]),
});

export type Moved = z.infer<typeof MovedSchema>;

export const ChangeSchema = z.object({
  id: z.string(),
  kind: z.enum(["state", "data"]),
  name: z.string(),
  namespace: z.string(),
  file: z.string(),
  change: z.enum(["added", "changed", "removed"]),
  moved: z.array(MovedSchema).optional(),
});

// One row: what changed, and when, which is the key it is under.
export interface Change extends z.infer<typeof ChangeSchema> {
  key: string;
  at: Date;
}

// The timestamp is the first 48 bits of a uuidv7, in milliseconds.
// Reading it from the key is why there is no timestamp beside it.
export const timeOf = (key: string): Date =>
  new Date(parseInt(key.replace(/-/g, "").slice(0, 12), 16));

// The entries of a reverse range, as rows. The value is a
// `google.protobuf.Value`, so it is unwrapped the way the description
// is. An entry this page cannot read is left out rather than allowed
// to empty the page.
export const changesOf = (
  entries: { key: string; value?: { toJson: () => unknown } }[]
): Change[] =>
  entries.flatMap((entry) => {
    const change = ChangeSchema.safeParse(entry.value?.toJson());
    return change.success
      ? [{ ...change.data, key: entry.key, at: timeOf(entry.key) }]
      : [];
  });

// How long ago, in the coarsest unit that still says something. The
// page is watched while somebody works, so seconds and minutes are
// what it mostly shows.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 1000],
  ["minute", 1000 * 60],
  ["hour", 1000 * 60 * 60],
  ["day", 1000 * 60 * 60 * 24],
];

export const agoOf = (at: Date, now: Date): string => {
  const elapsed = at.getTime() - now.getTime();

  let [unit, ms] = UNITS[0];
  for (const [larger, size] of UNITS) {
    if (Math.abs(elapsed) < size) {
      break;
    }
    [unit, ms] = [larger, size];
  }

  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round(elapsed / ms),
    unit
  );
};
