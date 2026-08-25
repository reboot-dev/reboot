// What the dashboard noticed changing in the developer's API files,
// and how to read it.
//
// Written by `changelog.py` as `rbt.dashboard.v1.Change` and stored
// in an `OrderedMap` keyed by a uuidv7, so the keys are in the order
// the changes happened and a reverse range is newest first. The
// map's items are `google.protobuf.Value`s, so each entry is typed
// from the proto rather than parsed: `PlainMessage` is the message's
// fields without its methods, and `changedParts` is optional because an
// entry whose type was added or removed whole was recorded without
// one.
import type { PlainMessage } from "@bufbuild/protobuf";
import type {
  Change as ChangeMessage,
  ChangedPart as ChangedPartMessage,
} from "../../../../rbt/dashboard/v1/dashboard_pb";

export type ChangedPart = PlainMessage<ChangedPartMessage>;

// One row: what changed, and when, which is the key it is under.
export type Change = Omit<PlainMessage<ChangeMessage>, "changedParts"> & {
  changedParts?: ChangedPart[];
  key: string;
  at: Date;
};

// The timestamp is the first 48 bits of a uuidv7, in milliseconds.
// Reading it from the key is why there is no timestamp beside it.
export const timeInUuid7 = (key: string): Date =>
  new Date(parseInt(key.replace(/-/g, "").slice(0, 12), 16));

// The entries of a reverse range, as rows.
export const changesInEntries = (
  entries: { key: string; value?: { toJson: () => unknown } }[]
): Change[] =>
  entries.flatMap((entry) => {
    const change = entry.value?.toJson();
    return change === null ||
      typeof change !== "object" ||
      Array.isArray(change)
      ? []
      : [
          {
            ...(change as Omit<Change, "key" | "at">),
            key: entry.key,
            at: timeInUuid7(entry.key),
          },
        ];
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

export const timeAgo = (at: Date, now: Date): string => {
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
