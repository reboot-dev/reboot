// What the behaviors page derives from the parsed `.feature` files:
// their order, their scenario counts, and where a backticked span of
// a step links.

import type * as feature_pb from "../../../../rbt/v1alpha1/bdd/feature_pb";
import type * as grammar_pb from "../../../../rbt/v1alpha1/bdd/grammar_pb";
import type { APIs } from "./link_properties_to_data_types";
import { qualifiedName } from "./link_properties_to_data_types";

export type Features = { [filename: string]: feature_pb.Feature };

// One feature file, with the path the state keys it by, which is the
// path the developer would open.
export interface FeatureEntry {
  filename: string;
  feature: feature_pb.Feature;
}

export const sortedFeatures = (features: Features): FeatureEntry[] =>
  Object.entries(features)
    .map(([filename, feature]) => ({ filename, feature }))
    .sort((a, b) => a.filename.localeCompare(b.filename));

// Every scenario of a feature: the ones that belong to it directly,
// then each rule's, which is the order they are written in the file.
export const scenariosOfFeature = (
  feature: feature_pb.Feature
): feature_pb.Scenario[] => [
  ...feature.scenarios,
  ...feature.rules.flatMap((rule) => rule.scenarios),
];

// The directory a feature file is in, which is how the sidebar groups
// features, the way packages group types.
export const directoryOfFeature = (filename: string): string => {
  const slash = filename.lastIndexOf("/");
  return slash === -1 ? "." : filename.slice(0, slash);
};

// Where the backticked spans of steps can link: each state type's
// short name mapped to its id on the state page, and each method name
// mapped to every state type declaring one by that name.
export interface StepLinks {
  stateTypes: Map<string, string>;
  methods: Map<string, { stateType: string; id: string }[]>;
}

export const stepLinks = (apis: APIs): StepLinks => {
  // A short name two state types share cannot say which one a step
  // means, so it is mapped to `null` here and dropped below.
  const stateTypes = new Map<string, string | null>();
  const methods = new Map<string, { stateType: string; id: string }[]>();
  for (const api of Object.values(apis)) {
    for (const stateType of api.stateTypes) {
      const id = qualifiedName({ api, stateType });
      stateTypes.set(
        stateType.name,
        stateTypes.has(stateType.name) ? null : id
      );
      for (const method of stateType.methods) {
        const candidates = methods.get(method.name) ?? [];
        candidates.push({
          stateType: stateType.name,
          id: `${id}.${method.name}`,
        });
        methods.set(method.name, candidates);
      }
    }
  }
  return {
    stateTypes: new Map(
      [...stateTypes.entries()].flatMap(([name, id]) =>
        id === null ? [] : [[name, id] as [string, string]]
      )
    ),
    methods,
  };
};

// The id on the state page a method links to, and `undefined` for a
// method name no state type declares, or one several declare when
// `stateType`, the state type the step names, is not among them: the
// page never guesses which state type a step means.
export const linkOfMethod = (
  method: string,
  stateType: string | undefined,
  links: StepLinks
): string | undefined => {
  const candidates = links.methods.get(method);
  if (candidates === undefined) {
    return undefined;
  }
  if (candidates.length === 1) {
    return candidates[0].id;
  }
  const named = candidates.filter(
    (candidate) => candidate.stateType === stateType
  );
  return named.length === 1 ? named[0].id : undefined;
};

// The id on the state page one backticked span of a step the grammar
// does not define links to, and `undefined` for a span that is
// neither a state type nor a method: the step's own text is the only
// clue to which state type a method name means.
export const linkOfCodeSpan = (
  span: string,
  stepText: string,
  links: StepLinks
): string | undefined => {
  const stateType = links.stateTypes.get(span);
  if (stateType !== undefined) {
    return stateType;
  }
  const candidates = links.methods.get(span) ?? [];
  const named = candidates.filter((candidate) =>
    stepText.includes("`" + candidate.stateType + "`")
  );
  return linkOfMethod(
    span,
    named.length === 1 ? named[0].stateType : undefined,
    links
  );
};

// What a run of a printed step is to the grammar, which is how the
// page sets it. `text` is the grammar's own words.
export type Role =
  | "text"
  | "state-type"
  | "state-id"
  | "method"
  | "property-path"
  | "value"
  | "variable"
  | "saved-name"
  | "error-type"
  | "user"
  | "application"
  | "duration";

export interface Span {
  text: string;
  role: Role;
}

// A step printed from its syntax tree: the spans before its clause
// list, each clause of the list, and the spans after. A step without
// a clause list has only a head.
export interface Printed {
  head: Span[];
  clauses: Span[][];
  tail: Span[];
}

const text = (words: string): Span => ({ text: words, role: "text" });

// A variable in a step's text, `${name}`, whose saved value is spliced
// in when the scenario runs.
const VARIABLE = /\$\{\w+\}/g;

// Text that may hold variables, as spans: each variable as one, and
// the text between as spans of `role`.
const spansOfText = (words: string, role: Role): Span[] => {
  const spans: Span[] = [];
  let at = 0;
  for (const match of words.matchAll(VARIABLE)) {
    if (match.index > at) {
      spans.push({ text: words.slice(at, match.index), role });
    }
    spans.push({ text: match[0], role: "variable" });
    at = match.index + match[0].length;
  }
  if (at < words.length) {
    spans.push({ text: words.slice(at), role });
  }
  return spans;
};

const spansOfValue = (value: grammar_pb.Value | undefined): Span[] =>
  spansOfText(value?.json ?? "", "value");

const spansOfStateId = (id: string): Span[] => spansOfText(id, "state-id");

// 'the `Account` for "alice"', as the grammar's `STATE` phrase.
const spansOfState = (state: grammar_pb.State | undefined): Span[] => [
  text("the "),
  { text: state?.type ?? "", role: "state-type" },
  text(" for "),
  ...spansOfStateId(state?.id ?? ""),
];

const spansOfAssignment = (assignment: grammar_pb.Assignment): Span[] => [
  { text: assignment.path, role: "property-path" },
  text("="),
  ...spansOfValue(assignment.value),
];

const spansOfAssertion = (assertion: grammar_pb.Assertion): Span[] => {
  switch (assertion.assertion.case) {
    case "equals":
      return [
        { text: assertion.assertion.value.path, role: "property-path" },
        text("="),
        ...spansOfValue(assertion.assertion.value.value),
      ];
    case "containing":
      return [
        { text: assertion.assertion.value.path, role: "property-path" },
        text(" containing "),
        ...spansOfValue(assertion.assertion.value.argument),
      ];
    case "ofLength":
      return [
        { text: assertion.assertion.value.path, role: "property-path" },
        text(" of length "),
        ...spansOfValue(assertion.assertion.value.length),
      ];
    default:
      return [];
  }
};

const spansOfSave = (save: grammar_pb.Save): Span[] => [
  { text: save.path, role: "property-path" },
  text(" saved as "),
  { text: save.name, role: "saved-name" },
];

const spanOfSeconds = (seconds: number): Span => ({
  text: `${seconds} ${seconds === 1 ? "second" : "seconds"}`,
  role: "duration",
});

// The article before a name, with its trailing space: `an` before a
// vowel, the way the grammar accepts either and English reads.
const articleOf = (name: string): string =>
  /^[AEIOUaeiou]/.test(name) ? "an " : "a ";

// A clause list with its introducing word, or nothing for an empty
// list, since the grammar leaves the word out with it.
const withClauses = (
  word: string,
  clauses: Span[][]
): { head: Span[]; clauses: Span[][] } =>
  clauses.length === 0
    ? { head: [], clauses: [] }
    : { head: [text(` ${word} `)], clauses };

// A built-in step printed from its syntax tree, the way the grammar
// spells it. The grammar is strict enough that this is the step as
// written, but for `,` against `and` between clauses and `a` against
// `an`.
export const printBuiltInSyntax = (
  syntax: grammar_pb.BuiltInSyntax
): Printed => {
  const step = syntax.step;
  switch (step.case) {
    case "applicationIsUp":
      return {
        head:
          step.value.name === undefined
            ? [text("the application is up")]
            : [
                text("the "),
                { text: `"${step.value.name}"`, role: "application" },
                text(" application is up"),
              ],
        clauses: [],
        tail: [],
      };
    case "authenticatedUserIs":
      return {
        head: [
          text("the authenticated user is "),
          { text: `"${step.value.userId}"`, role: "user" },
        ],
        clauses: [],
        tail: [],
      };
    case "userIsUnauthenticated":
      return {
        head: [text("the user is unauthenticated")],
        clauses: [],
        tail: [],
      };
    case "bearerTokenIs":
      return {
        head: [
          text("the bearer token is "),
          { text: `"${step.value.bearerToken}"`, role: "value" },
        ],
        clauses: [],
        tail: [],
      };
    case "sharedContext":
      return { head: [text("a shared context")], clauses: [], tail: [] };
    case "getsCreatedVia": {
      const state = step.value.state;
      const article = articleOf(state?.type ?? "");
      const clauses = withClauses(
        "with",
        step.value.assignments.map(spansOfAssignment)
      );
      return {
        head: [
          text(article),
          { text: state?.type ?? "", role: "state-type" },
          text(" for "),
          ...spansOfStateId(state?.id ?? ""),
          text(" gets created via "),
          { text: step.value.method, role: "method" },
          ...clauses.head,
        ],
        clauses: clauses.clauses,
        tail: [],
      };
    }
    case "gets": {
      const clauses = withClauses(
        "with",
        step.value.assignments.map(spansOfAssignment)
      );
      return {
        head: [
          ...spansOfState(step.value.state),
          text(` gets ${articleOf(step.value.method)}`),
          { text: step.value.method, role: "method" },
          ...clauses.head,
        ],
        clauses: clauses.clauses,
        tail:
          step.value.taskIdSavedAs === undefined
            ? []
            : [
                text(" spawned with its task id saved as "),
                { text: step.value.taskIdSavedAs, role: "saved-name" },
              ],
      };
    }
    case "attempts": {
      const clauses = withClauses(
        "with",
        step.value.assignments.map(spansOfAssignment)
      );
      return {
        head: [
          ...spansOfState(step.value.state),
          text(` attempts ${articleOf(step.value.method)}`),
          { text: step.value.method, role: "method" },
          ...clauses.head,
        ],
        clauses: clauses.clauses,
        tail: [],
      };
    }
    case "taskCompletes":
      return {
        head: [
          text("the "),
          { text: step.value.method, role: "method" },
          text(" task with id "),
          { text: "${" + step.value.taskIdSavedAs + "}", role: "variable" },
          text(" of the "),
          { text: step.value.stateType, role: "state-type" },
          text(" completes within "),
          spanOfSeconds(step.value.seconds),
        ],
        clauses: [],
        tail: [],
      };
    case "attemptAbortsWith": {
      const clauses = withClauses(
        "with",
        step.value.assertions.map(spansOfAssertion)
      );
      return {
        head: [
          text("the attempt aborts with "),
          { text: step.value.errorType, role: "error-type" },
          ...clauses.head,
        ],
        clauses: clauses.clauses,
        tail: [],
      };
    }
    case "has":
      return {
        head: [
          { text: step.value.method, role: "method" },
          text(" on "),
          ...spansOfState(step.value.state),
          text(" has "),
        ],
        clauses: step.value.assertions.map(spansOfAssertion),
        tail: [],
      };
    case "eventuallyHas":
      return {
        head: [
          { text: step.value.method, role: "method" },
          text(" on "),
          ...spansOfState(step.value.state),
          text(" eventually has "),
        ],
        clauses: step.value.assertions.map(spansOfAssertion),
        tail: [text(" within "), spanOfSeconds(step.value.seconds)],
      };
    case "hasSavedAs":
      return {
        head: [
          { text: step.value.method, role: "method" },
          text(" on "),
          ...spansOfState(step.value.state),
          text(" has "),
        ],
        clauses: step.value.saves.map(spansOfSave),
        tail: [],
      };
    case "abortsWith": {
      const clauses = withClauses(
        "with",
        step.value.assertions.map(spansOfAssertion)
      );
      return {
        head: [
          { text: step.value.method, role: "method" },
          text(" on "),
          ...spansOfState(step.value.state),
          text(" aborts with "),
          { text: step.value.errorType, role: "error-type" },
          ...clauses.head,
        ],
        clauses: clauses.clauses,
        tail: [],
      };
    }
    case "resultHas":
      return {
        head: [text("the result has ")],
        clauses: step.value.assertions.map(spansOfAssertion),
        tail: [],
      };
    case "resultingIsSavedAs":
      return {
        head: [
          text("the resulting "),
          { text: step.value.save?.path ?? "", role: "property-path" },
          text(" is saved as "),
          { text: step.value.save?.name ?? "", role: "saved-name" },
        ],
        clauses: [],
        tail: [],
      };
    default:
      return { head: [], clauses: [], tail: [] };
  }
};

// Every span of a printed step, in order.
export const spansOfPrinted = (printed: Printed): Span[] => [
  ...printed.head,
  ...printed.clauses.flat(),
  ...printed.tail,
];

// The spans a scenario sets in a hue of their own: each saved value,
// where it is saved and where it is recalled, and each state id,
// wherever it is named. What the hue is keyed by says which of the
// two a span is, since a state id and a saved name may be spelled
// the same.
export const hueKeyOfSpan = (span: Span): string | undefined =>
  span.role === "state-id"
    ? `state:${span.text}`
    : span.role === "variable"
    ? `saved:${span.text.slice(2, -1)}`
    : span.role === "saved-name"
    ? `saved:${span.text}`
    : undefined;

// Hues far enough apart to tell one saved value from the next, and
// one state id from the next; the two palettes share no hue, and
// both keep clear of the hues the other roles are set in.
const SAVED_HUES = [28, 350, 110, 190, 300, 55];
const STATE_ID_HUES = [150, 245, 80, 325, 5, 215];

// The hue each saved value and each state id of a scenario is set
// in, keyed the way `hueKeyOfSpan` keys them and assigned in the
// order the keys first appear across the steps, each kind from its
// own palette.
export const huesOfSpans = (steps: feature_pb.Step[]): Map<string, number> => {
  const hues = new Map<string, number>();
  const counts = { saved: 0, state: 0 };
  for (const step of steps) {
    if (step.builtIn === undefined) {
      continue;
    }
    for (const span of spansOfPrinted(printBuiltInSyntax(step.builtIn))) {
      const key = hueKeyOfSpan(span);
      if (key === undefined || hues.has(key)) {
        continue;
      }
      if (key.startsWith("state:")) {
        hues.set(key, STATE_ID_HUES[counts.state % STATE_ID_HUES.length]);
        counts.state += 1;
      } else {
        hues.set(key, SAVED_HUES[counts.saved % SAVED_HUES.length]);
        counts.saved += 1;
      }
    }
  }
  return hues;
};
