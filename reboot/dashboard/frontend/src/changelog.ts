// What the dashboard noticed changing, and how to read it.
//
// Written as `rbt.dashboard.v1.Change` and stored, serialized, in
// an `OrderedMap` keyed by a uuidv7, so the keys are in the order
// the changes happened and a reverse range is newest first.
import type {
  MethodChange,
  PropertyChange,
} from "../../../../rbt/dashboard/v1/dashboard_pb";
import { Change } from "../../../../rbt/dashboard/v1/dashboard_pb";
import {
  formatConstraints,
  formatType,
  labelOfKind,
} from "./link_fields_to_data_types";

// One entry of the changelog: a type the dashboard found added,
// changed or removed when it read a file. `key` is the uuidv7 the
// entry is under; `at` is the time in `key`, when the dashboard read
// the file.
export type Entry = {
  change: Change;
  key: string;
  at: Date;
};

// The timestamp is the first 48 bits of a uuidv7, in milliseconds.
// Reading it from the key is why there is no timestamp beside it.
export const timeInUuid7 = (key: string): Date =>
  new Date(parseInt(key.replace(/-/g, "").slice(0, 12), 16));

// The entries of a reverse range, parsed. An entry holding anything
// but a serialized `Change` is left out.
export const entriesOfRange = (
  entries: { key: string; bytes?: Uint8Array }[]
): Entry[] =>
  entries.flatMap((entry) => {
    if (entry.bytes === undefined) {
      return [];
    }
    try {
      return [
        {
          change: Change.fromBinary(entry.bytes),
          key: entry.key,
          at: timeInUuid7(entry.key),
        },
      ];
    } catch {
      return [];
    }
  });

// What a row of the changelog shows, the same for every kind of
// change: where it happened, what kind of thing changed, what
// happened to it, its name, the id of the page to link to when the
// thing still exists, and which of its parts changed and how.
// One thing that happened to a part of a type: the noun and name of
// the part, what happened to it, and what more the row says about
// it. `difference` is the CSS class; `verb` is the words.
export type Part = {
  noun: string;
  name: string;
  difference: "added" | "changed" | "removed";
  verb: string;
  detail?: string;
};

// What the kind pill says: where the change lives, the API files or
// the code, and for the API which of its pages.
export const labelOfChangeKind: Record<Row["kind"], string> = {
  state: "API · STATE",
  data: "API · DATA",
  implementation: "CODE",
};

export type Row = {
  where: string;
  kind: "state" | "data" | "implementation";
  difference: string;
  name: string;
  // The page and id the name links to; none once the thing is gone
  // and none for a thing with no page.
  link?: { page: "state" | "data"; id: string };
  parts: Part[];
};

const fromTo = (from: string | undefined, to: string | undefined): string =>
  from === undefined
    ? `to ${to ?? "none"}`
    : to === undefined
    ? `from ${from}, now none`
    : `from ${from} to ${to}`;

const partsOfProperties = (properties: PropertyChange[]): Part[] =>
  properties.map((property) => {
    const noun = "property";
    const name = property.name;
    const c = property.change;
    switch (c.case) {
      case "added":
        return { noun, name, difference: "added", verb: "added" };
      case "removed":
        return { noun, name, difference: "removed", verb: "removed" };
      case "renamed":
        return {
          noun,
          name: c.value.from,
          difference: "changed",
          verb: "renamed",
          detail: `to ${c.value.to}`,
        };
      case "type":
        return {
          noun,
          name,
          difference: "changed",
          verb: "type changed",
          detail: `from ${formatType(c.value.from)} to ${formatType(
            c.value.to
          )}`,
        };
      case "required":
        return {
          noun,
          name,
          difference: "changed",
          verb: c.value.required ? "now required" : "now optional",
        };
      case "default":
        return {
          noun,
          name,
          difference: "changed",
          verb: "default changed",
          detail: fromTo(c.value.from, c.value.to),
        };
      case "description":
        return {
          noun,
          name,
          difference: "changed",
          verb: "description changed",
        };
      case "constraints":
        return {
          noun,
          name,
          difference: "changed",
          verb: "constraints changed",
          detail: fromTo(
            formatConstraints(c.value.from),
            formatConstraints(c.value.to)
          ),
        };
      case "deprecated":
        return {
          noun,
          name,
          difference: "changed",
          verb: c.value.deprecated ? "now deprecated" : "no longer deprecated",
        };
      case undefined:
        return { noun, name, difference: "changed", verb: "changed" };
    }
  });

const partsOfMethods = (methods: MethodChange[]): Part[] =>
  methods.map((method) => {
    const noun = "method";
    const name = method.name;
    const c = method.change;
    switch (c.case) {
      case "added":
        return { noun, name, difference: "added", verb: "added" };
      case "removed":
        return { noun, name, difference: "removed", verb: "removed" };
      case "kind":
        return {
          noun,
          name,
          difference: "changed",
          verb: "kind changed",
          detail: fromTo(labelOfKind(c.value.from), labelOfKind(c.value.to)),
        };
      case "factory":
        return {
          noun,
          name,
          difference: "changed",
          verb: c.value.factory ? "now a factory" : "no longer a factory",
        };
      case "mcp":
        return {
          noun,
          name,
          difference: "changed",
          verb: c.value.mcp ? "now an MCP tool" : "no longer an MCP tool",
        };
      case "request":
        return {
          noun,
          name,
          difference: "changed",
          verb: "request changed",
          detail: fromTo(c.value.from?.name, c.value.to?.name),
        };
      case "response":
        return {
          noun,
          name,
          difference: "changed",
          verb: "response changed",
          detail: fromTo(c.value.from?.name, c.value.to?.name),
        };
      case "errors":
        return {
          noun,
          name,
          difference: "changed",
          verb: "errors changed",
          detail: fromTo(
            c.value.from.map((error) => error.name).join(", ") || "none",
            c.value.to.map((error) => error.name).join(", ") || "none"
          ),
        };
      case "description":
        return {
          noun,
          name,
          difference: "changed",
          verb: "description changed",
        };
      case undefined:
        return { noun, name, difference: "changed", verb: "changed" };
    }
  });

const namespaceOf = (qualified: string): string =>
  qualified.includes(".") ? qualified.slice(0, qualified.lastIndexOf(".")) : "";

const shortNameOf = (qualified: string): string =>
  qualified.slice(qualified.lastIndexOf(".") + 1);

// How each kind of change reads as a row. Every arm of `Change` is
// handled here, so a new arm is a compile error until it is.
export const rowOfChange = (change: Change): Row => {
  const what = change.change;
  switch (what.case) {
    case "stateTypeAdded":
      return {
        where: namespaceOf(what.value.name),
        kind: "state",
        difference: "added",
        name: shortNameOf(what.value.name),
        link: { page: "state", id: what.value.name },
        parts: [],
      };
    case "stateTypeChanged":
      return {
        where: namespaceOf(what.value.name),
        kind: "state",
        difference: "changed",
        name: shortNameOf(what.value.name),
        link: { page: "state", id: what.value.name },
        parts: [
          ...(what.value.stateModelRenamed === undefined
            ? []
            : [
                {
                  noun: "state model",
                  name: what.value.stateModelRenamed.from,
                  difference: "changed" as const,
                  verb: "renamed",
                  detail: `to ${what.value.stateModelRenamed.to}`,
                },
              ]),
          ...(what.value.description === undefined
            ? []
            : [
                {
                  noun: "",
                  name: shortNameOf(what.value.name),
                  difference: "changed" as const,
                  verb: "description changed",
                },
              ]),
          ...partsOfProperties(what.value.properties),
          ...partsOfMethods(what.value.methods),
        ],
      };
    case "stateTypeRemoved":
      return {
        where: namespaceOf(what.value.name),
        kind: "state",
        difference: "removed",
        name: shortNameOf(what.value.name),
        parts: [],
      };
    case "dataTypeAdded":
      return {
        where: namespaceOf(what.value.name),
        kind: "data",
        difference: "added",
        name: shortNameOf(what.value.name),
        link: { page: "data", id: what.value.name },
        parts: [],
      };
    case "dataTypeChanged":
      return {
        where: namespaceOf(what.value.name),
        kind: "data",
        difference: "changed",
        name: shortNameOf(what.value.name),
        link: { page: "data", id: what.value.name },
        parts: [
          ...(what.value.description === undefined
            ? []
            : [
                {
                  noun: "",
                  name: shortNameOf(what.value.name),
                  difference: "changed" as const,
                  verb: "description changed",
                },
              ]),
          ...partsOfProperties(what.value.properties),
        ],
      };
    case "dataTypeRemoved":
      return {
        where: namespaceOf(what.value.name),
        kind: "data",
        difference: "removed",
        name: shortNameOf(what.value.name),
        parts: [],
      };
    case "implementationAdded":
      return {
        where: namespaceOf(what.value.stateType),
        kind: "implementation",
        difference: "added",
        name: shortNameOf(what.value.stateType),
        link: { page: "state", id: what.value.stateType },
        parts: [],
      };
    case "implementationChanged":
      return {
        where: namespaceOf(what.value.stateType),
        kind: "implementation",
        difference: "changed",
        name: shortNameOf(what.value.stateType),
        link: { page: "state", id: what.value.stateType },
        parts: partsOfMethods(what.value.methods),
      };
    case "implementationRemoved":
      return {
        where: namespaceOf(what.value.stateType),
        kind: "implementation",
        difference: "removed",
        name: shortNameOf(what.value.stateType),
        parts: [],
      };
    case undefined:
      return { where: "", kind: "state", difference: "", name: "", parts: [] };
  }
};

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

  const rounded = Math.round(elapsed / ms);
  // `Intl.RelativeTimeFormat` formats zero seconds as "now";
  // `ChangeRow` prefixes "read ", so the freshest row reads
  // "read just now".
  if (rounded === 0 && unit === "second") {
    return "just now";
  }
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    rounded,
    unit
  );
};
