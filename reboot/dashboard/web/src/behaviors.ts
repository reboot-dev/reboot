// What the behaviors page derives from the parsed `.feature` files:
// their order, their scenario counts, and where a backticked span of
// a step links.

import type * as feature_pb from "../../../../rbt/v1alpha1/bdd/feature_pb";
import type * as grammar_pb from "../../../../rbt/v1alpha1/bdd/grammar_pb";
import { Element_Role } from "../../../../rbt/v1alpha1/bdd/grammar_pb";
import type { APIs } from "./link_properties_to_data_types";
import { qualifiedName } from "./link_properties_to_data_types";

export type Features = { [filename: string]: feature_pb.Feature };

// One feature file, with the path the state keys it by, which is the
// path the developer would open.
export interface FeatureEntry {
  filename: string;
  feature: feature_pb.Feature;
}

// Where the dashboard serves a recording named by its path relative to
// the working directory, each segment escaped on its own so the
// slashes stay.
export const recordingUrl = (path: string): string =>
  "/recordings/" + path.split("/").map(encodeURIComponent).join("/");

export const sortedFeatures = (features: Features): FeatureEntry[] =>
  Object.entries(features)
    .map(([filename, feature]) => ({ filename, feature }))
    .sort((a, b) => a.filename.localeCompare(b.filename));

// When a feature file was last modified, and the epoch for one the
// state records no time for.
export const modifiedAt = (feature: feature_pb.Feature): Date =>
  feature.modified === undefined ? new Date(0) : feature.modified.toDate();

// Features most recently worked on first, so that a long-lived
// project's index leads with what is moving; ties by path.
export const featuresByRecency = (features: FeatureEntry[]): FeatureEntry[] =>
  [...features].sort(
    (a, b) =>
      modifiedAt(b.feature).getTime() - modifiedAt(a.feature).getTime() ||
      a.filename.localeCompare(b.filename)
  );

// Every step a feature runs: its background's, each scenario's, and
// each rule's background's and scenarios'.
export const stepsOfFeature = (
  feature: feature_pb.Feature
): feature_pb.Step[] => [
  ...(feature.background?.steps ?? []),
  ...feature.scenarios.flatMap((scenario) => scenario.steps),
  ...feature.rules.flatMap((rule) => [
    ...(rule.background?.steps ?? []),
    ...rule.scenarios.flatMap((scenario) => scenario.steps),
  ]),
];

// The state type a built-in step calls or reads, as the step names
// it; `undefined` for a step about no state.
const stateTypeOfStep = (step: feature_pb.Step): string | undefined => {
  const syntax = step.builtIn?.step;
  if (syntax === undefined) {
    return undefined;
  }
  switch (syntax.case) {
    case "createsVia":
    case "does":
    case "attempts":
    case "has":
    case "eventuallyHas":
    case "hasSavedAs":
    case "abortsWith":
      return syntax.value.state?.type;
    case "awaitsTask":
      return syntax.value.stateType;
    default:
      return undefined;
  }
};

// The state types a feature's steps name, in the order first named.
export const stateTypesOfFeature = (feature: feature_pb.Feature): string[] => {
  const types: string[] = [];
  for (const step of stepsOfFeature(feature)) {
    const type = stateTypeOfStep(step);
    if (type !== undefined && !types.includes(type)) {
      types.push(type);
    }
  }
  return types;
};

// Whether a step drives the web app: every web app step's syntax is
// named for it.
const isWebAppStep = (step: feature_pb.Step): boolean =>
  /WebApp/.test(step.builtIn?.step.case ?? "");

// Whether a scenario with the given steps drives the web app, so that
// running it records a browser.
export const drivesWebApp = (steps: feature_pb.Step[]): boolean =>
  steps.some(isWebAppStep);

// A feature's scenarios describing behavior the application does not
// have yet, each with the rule it is under, if any: those tagged
// themselves, and every one under a tagged rule or feature, since a
// feature's and a rule's tags apply to each scenario under them.
export const blockedScenariosOfFeature = (
  feature: feature_pb.Feature
): { scenario: feature_pb.Scenario; rule?: feature_pb.Rule }[] => {
  const featureBlocked = feature.tags.includes(BLOCKED_TAG);
  return [
    ...feature.scenarios
      .filter((scenario) => featureBlocked || isBlocked(scenario))
      .map((scenario) => ({ scenario, rule: undefined })),
    ...feature.rules.flatMap((rule) =>
      rule.scenarios
        .filter(
          (scenario) =>
            featureBlocked ||
            rule.tags.includes(BLOCKED_TAG) ||
            isBlocked(scenario)
        )
        .map((scenario) => ({ scenario, rule }))
    ),
  ];
};

// How many of a feature's scenarios drive the web app.
export const webAppScenarioCount = (feature: feature_pb.Feature): number =>
  scenariosOfFeature(feature).filter((scenario) => drivesWebApp(scenario.steps))
    .length;

// Every state type any feature names, in the order first named
// across the features as given.
export const stateTypesOfFeatures = (features: FeatureEntry[]): string[] => {
  const types: string[] = [];
  for (const { feature } of features) {
    for (const type of stateTypesOfFeature(feature)) {
      if (!types.includes(type)) {
        types.push(type);
      }
    }
  }
  return types;
};

// The method a built-in step calls or reads, as the features page
// prints it, `Account.deposit`; `undefined` for a step about none.
// The state type is the last segment of the name the step writes, so
// that a search for `Account.deposit` finds a step naming the type
// in full.
const methodLabelOfStep = (step: feature_pb.Step): string | undefined => {
  const syntax = step.builtIn?.step;
  if (syntax === undefined) {
    return undefined;
  }
  switch (syntax.case) {
    case "createsVia":
    case "does":
    case "attempts":
    case "has":
    case "eventuallyHas":
    case "hasSavedAs":
    case "abortsWith":
      return syntax.value.state === undefined
        ? undefined
        : `${syntax.value.state.type.split(".").pop()}.${syntax.value.method}`;
    case "awaitsTask":
      return `${syntax.value.stateType.split(".").pop()}.${
        syntax.value.method
      }`;
    default:
      return undefined;
  }
};

const methodLabelsOfSteps = (steps: feature_pb.Step[]): string[] =>
  steps.flatMap((step) => {
    const label = methodLabelOfStep(step);
    return label === undefined ? [] : [label];
  });

// What the index searches: the words a feature is made of, its name,
// description, tags, rules, scenarios and steps, and the methods its
// steps exercise as the page prints them, lowercased and joined, so
// that a query matches wherever it is written.
const textOfFeature = (feature: feature_pb.Feature): string =>
  [
    feature.name ?? "",
    feature.description ?? "",
    ...feature.tags,
    ...feature.rules.flatMap((rule) => [
      rule.name ?? "",
      rule.description ?? "",
    ]),
    ...scenariosOfFeature(feature).flatMap((scenario) => [
      scenario.name ?? "",
      ...scenario.tags,
    ]),
    ...stepsOfFeature(feature).map((step) => step.text),
    ...methodLabelsOfSteps(stepsOfFeature(feature)),
  ]
    .join("\n")
    .toLowerCase();

const textOfRule = (rule: feature_pb.Rule): string =>
  [
    rule.name ?? "",
    rule.description ?? "",
    ...(rule.background?.steps ?? []).map((step) => step.text),
    ...rule.scenarios.flatMap((scenario) => [
      scenario.name ?? "",
      ...scenario.tags,
      ...scenario.steps.map((step) => step.text),
      ...methodLabelsOfSteps(scenario.steps),
    ]),
    ...methodLabelsOfSteps(rule.background?.steps ?? []),
  ]
    .join("\n")
    .toLowerCase();

// The index's filter: words to find, state types the feature must
// name, every one of them, whether it must drive the web app, whether
// it must be being worked on, and whether it must have a blocked
// scenario.
export interface FeatureFilter {
  query: string;
  stateTypes: string[];
  webApp: boolean;
  wip: boolean;
  blocked: boolean;
}

// Whether a feature is about what the filter asks for, its words
// aside: it names every state type asked for, drives the web app if
// that is asked, is being worked on if that is asked, and has a
// blocked scenario if that is asked.
const featureIsAbout = (
  feature: feature_pb.Feature,
  filter: FeatureFilter
): boolean => {
  const types = stateTypesOfFeature(feature);
  return (
    filter.stateTypes.every((type) => types.includes(type)) &&
    (!filter.webApp || webAppScenarioCount(feature) > 0) &&
    (!filter.wip || isWip(feature)) &&
    (!filter.blocked || blockedScenariosOfFeature(feature).length > 0)
  );
};

// Whether the filter keeps a feature: it is about what is asked for,
// and the words appear somewhere in it.
export const featurePasses = (
  feature: feature_pb.Feature,
  filter: FeatureFilter
): boolean => {
  if (!featureIsAbout(feature, filter)) {
    return false;
  }
  const query = filter.query.trim().toLowerCase();
  return query === "" || textOfFeature(feature).includes(query);
};

// Whether the filter keeps a rule: its feature is about what is
// asked for, and the words appear in the rule or in its feature's
// name.
export const rulePasses = (
  feature: feature_pb.Feature,
  rule: feature_pb.Rule,
  filter: FeatureFilter
): boolean => {
  if (!featureIsAbout(feature, filter)) {
    return false;
  }
  const query = filter.query.trim().toLowerCase();
  return (
    query === "" ||
    textOfRule(rule).includes(query) ||
    (feature.name ?? "").toLowerCase().includes(query)
  );
};

// The tag of a scenario describing behavior the application does not
// have yet, which its description explains; such a scenario is
// skipped when the feature runs.
export const BLOCKED_TAG = "@blocked";

// The tag of a feature, rule or scenario being worked on, which runs
// as usual: what is new in the application right now.
export const WIP_TAG = "@wip";

export const isBlocked = (scenario: feature_pb.Scenario): boolean =>
  scenario.tags.includes(BLOCKED_TAG);

// Whether a feature is being worked on anywhere: tagged itself, or
// holding a rule or scenario that is.
export const isWip = (feature: feature_pb.Feature): boolean =>
  feature.tags.includes(WIP_TAG) ||
  feature.rules.some((rule) => rule.tags.includes(WIP_TAG)) ||
  scenariosOfFeature(feature).some((scenario) =>
    scenario.tags.includes(WIP_TAG)
  );

// Every scenario of a feature: the ones that belong to it directly,
// then each rule's, which is the order they are written in the file.
export const scenariosOfFeature = (
  feature: feature_pb.Feature
): feature_pb.Scenario[] => [
  ...feature.scenarios,
  ...feature.rules.flatMap((rule) => rule.scenarios),
];

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
  | "duration"
  | "element-name"
  | "element-role"
  | "label"
  | "page-text"
  | "key"
  | "path";

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

// A variable in a step's text, `<name>`: a column of a Scenario
// Outline's Examples table, or a value a step before it saved, spliced
// in when the scenario runs. The same shape pytest-bdd substitutes.
const VARIABLE = /<[^<>]+>/g;

// Text that may hold variables, as spans: each variable as one, its
// name without the angle brackets, since the page sets a variable
// apart by its role; and the text between as spans of `role`.
export const spansOfText = (words: string, role: Role): Span[] => {
  const spans: Span[] = [];
  let at = 0;
  for (const match of words.matchAll(VARIABLE)) {
    if (match.index > at) {
      spans.push({ text: words.slice(at, match.index), role });
    }
    spans.push({ text: match[0].slice(1, -1), role: "variable" });
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

// A user the scenario names, without the quotes the step writes
// them in, since the page sets a user apart by their role, the way it
// does a state id; a user named by a saved value is a variable.
const spansOfUser = (user: string): Span[] => spansOfText(user, "user");

// An element of the web app, by what it says and what it is: 'the
// "Open Account" button'. A <name> in what it says is a variable.
const spansOfElement = (element: grammar_pb.Element | undefined): Span[] => [
  text("the "),
  ...spansOfText(element?.name ?? "", "element-name"),
  text(" "),
  {
    text: Element_Role[
      element?.role ?? Element_Role.ROLE_UNSPECIFIED
    ].toLowerCase(),
    role: "element-role",
  },
];

const spanOfLabel = (label: string): Span => ({
  text: label,
  role: "label",
});

// The 'as "alice",' a calling step starts with, the comma setting the
// caller off from the call.
const spansOfCaller = (user: string): Span[] => [
  text("as "),
  ...spansOfUser(user),
  text(", "),
];

// 'the `Account` for "alice"', as the grammar's `STATE` phrase.
const spansOfState = (state: grammar_pb.State | undefined): Span[] => [
  text("the "),
  { text: state?.type ?? "", role: "state-type" },
  text(" for "),
  ...spansOfStateId(state?.id ?? ""),
];

// 'on `Account` of "alice"', as the grammar's `ON_STATE` phrase.
const spansOfStateOn = (state: grammar_pb.State | undefined): Span[] => [
  text(" on "),
  { text: state?.type ?? "", role: "state-type" },
  text(" of "),
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
                { text: step.value.name, role: "application" },
                text(" application is up"),
              ],
        clauses: [],
        tail: [],
      };
    case "isAnAuthenticatedUser":
      return {
        head: [
          ...spansOfUser(step.value.userId),
          text(" is an authenticated user"),
        ],
        clauses: [],
        tail: [],
      };
    case "isAnUnauthenticatedUser":
      return {
        head: [
          ...spansOfUser(step.value.userId),
          text(" is an unauthenticated user"),
        ],
        clauses: [],
        tail: [],
      };
    case "hasBearerToken":
      return {
        head: [
          ...spansOfUser(step.value.userId),
          text(" has the bearer token "),
          { text: `"${step.value.bearerToken}"`, role: "value" },
        ],
        clauses: [],
        tail: [],
      };
    case "sharedContext":
      return {
        head: [...spansOfCaller(step.value.user), text("a shared context")],
        clauses: [],
        tail: [],
      };
    case "createsVia": {
      const state = step.value.state;
      const clauses = withClauses(
        "with",
        step.value.assignments.map(spansOfAssignment)
      );
      // The id is given, or made up by the factory.
      const of: Span[] =
        state === undefined || state.id === ""
          ? []
          : [text(" of "), ...spansOfStateId(state.id)];
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(` creates ${articleOf(state?.type ?? "")}`),
          { text: state?.type ?? "", role: "state-type" },
          ...of,
          text(" via "),
          { text: step.value.method, role: "method" },
          ...clauses.head,
        ],
        clauses: clauses.clauses,
        tail: [],
      };
    }
    case "does": {
      const spawned = step.value.spawned;
      const clauses = withClauses(
        "with",
        step.value.assignments.map(spansOfAssignment)
      );
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(
            `${spawned ? " spawns " : " does "}${articleOf(step.value.method)}`
          ),
          { text: step.value.method, role: "method" },
          ...spansOfStateOn(step.value.state),
          ...clauses.head,
        ],
        clauses: clauses.clauses,
        tail: [],
      };
    }
    case "attempts": {
      const clauses = withClauses(
        "with",
        step.value.assignments.map(spansOfAssignment)
      );
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(` attempts ${articleOf(step.value.method)}`),
          { text: step.value.method, role: "method" },
          ...spansOfStateOn(step.value.state),
          ...clauses.head,
        ],
        clauses: clauses.clauses,
        tail: [],
      };
    }
    case "awaitsTask":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" awaits the "),
          { text: step.value.method, role: "method" },
          text(" task "),
          { text: step.value.taskIdSavedAs, role: "variable" },
          text(" on "),
          { text: step.value.stateType, role: "state-type" },
          text(" within "),
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
          ...spansOfCaller(step.value.user),
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
          ...spansOfCaller(step.value.user),
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
          ...spansOfCaller(step.value.user),
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
          ...spansOfCaller(step.value.user),
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
    case "opensWebApp": {
      const at: Span[] =
        step.value.path === undefined
          ? []
          : [text(" at "), { text: step.value.path, role: "path" }];
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" opens the web app"),
          ...at,
        ],
        clauses: [],
        tail: [],
      };
    }
    case "clicksInWebApp":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" clicks "),
          ...spansOfElement(step.value.element),
          text(" in the web app"),
        ],
        clauses: [],
        tail: [],
      };
    case "fillsInWebApp":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" fills "),
          spanOfLabel(step.value.label),
          text(" in the web app with "),
          ...spansOfValue(step.value.value),
        ],
        clauses: [],
        tail: [],
      };
    case "selectsInWebApp":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" selects "),
          ...spansOfText(step.value.option, "element-name"),
          text(" in "),
          spanOfLabel(step.value.label),
          text(" in the web app"),
        ],
        clauses: [],
        tail: [],
      };
    case "checksInWebApp":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(step.value.checked ? " checks " : " unchecks "),
          spanOfLabel(step.value.label),
          text(" in the web app"),
        ],
        clauses: [],
        tail: [],
      };
    case "pressesInWebApp":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" presses "),
          { text: step.value.key, role: "key" },
          text(" in the web app"),
        ],
        clauses: [],
        tail: [],
      };
    case "seesInWebApp":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(
            step.value.negated
              ? " does not see "
              : step.value.seconds === undefined
              ? " sees "
              : " eventually sees "
          ),
          ...spansOfText(step.value.text, "page-text"),
          ...(step.value.within === undefined
            ? []
            : [text(" in "), ...spansOfElement(step.value.within)]),
          text(" in the web app"),
        ],
        clauses: [],
        tail:
          step.value.seconds === undefined
            ? []
            : [text(" within "), spanOfSeconds(step.value.seconds)],
      };
    case "seesEnabledInWebApp":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" sees "),
          ...spansOfElement(step.value.element),
          text(
            ` in the web app is ${step.value.enabled ? "enabled" : "disabled"}`
          ),
        ],
        clauses: [],
        tail: [],
      };
    case "seesWebAppAt":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" sees the web app at "),
          ...spansOfText(step.value.path, "path"),
        ],
        clauses: [],
        tail: [],
      };
    case "isSignedInToWebApp": {
      const savedAs: Span[] =
        step.value.savedAs === undefined
          ? []
          : [
              text(" with their user id saved as "),
              { text: step.value.savedAs, role: "saved-name" },
            ];
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" is signed in to the web app"),
          ...savedAs,
        ],
        clauses: [],
        tail: [],
      };
    }
    case "isSignedOutOfWebApp":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" is signed out of the web app"),
        ],
        clauses: [],
        tail: [],
      };
    case "savesTextInWebAppAs":
      return {
        head: [
          ...spansOfUser(step.value.user),
          text(" saves the text of the "),
          { text: step.value.testId, role: "element-name" },
          text(" element in the web app as "),
          { text: step.value.name, role: "saved-name" },
        ],
        clauses: [],
        tail: [],
      };
    case "resultingStateIdIsSavedAs":
      return {
        head: [
          text("the resulting state id is saved as "),
          { text: step.value.name, role: "saved-name" },
        ],
        clauses: [],
        tail: [],
      };
    case "resultingTaskIdIsSavedAs":
      return {
        head: [
          text("the resulting task id is saved as "),
          { text: step.value.name, role: "saved-name" },
        ],
        clauses: [],
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

// The key a variable's hue is under: the same for the column of an
// Examples table, a save, and every `<name>` saying either, since a
// save may not use a column's name.
export const hueKeyOfVariable = (name: string): string => `variable:${name}`;

// The spans a scenario sets in a hue of their own: each variable,
// where it is saved and wherever it is said, each state id, wherever
// it is named, and each user, wherever they are named. What the hue
// is keyed by says which of the three a span is, since a user, a
// state id and a variable may be spelled the same.
export const hueKeyOfSpan = (span: Span): string | undefined =>
  span.role === "state-id"
    ? `state:${span.text}`
    : span.role === "user"
    ? `user:${span.text}`
    : span.role === "variable" || span.role === "saved-name"
    ? hueKeyOfVariable(span.text)
    : undefined;

// Hues far enough apart to tell one variable from the next, one state
// id from the next, and one user from the next; the three palettes
// share no hue, and all keep clear of the hues the other roles are
// set in.
const VARIABLE_HUES = [28, 350, 110, 190, 300, 55];
const STATE_ID_HUES = [150, 245, 80, 325, 5, 215];
const USER_HUES = [270, 40, 130, 205, 340, 95];

// The spans of a step as the page prints it: from its syntax tree for
// a built-in step, and from its text, with only the variables picked
// out, for a custom step.
export const spansOfStep = (step: feature_pb.Step): Span[] =>
  step.builtIn === undefined
    ? spansOfText(step.text, "text")
    : spansOfPrinted(printBuiltInSyntax(step.builtIn));

// The hue each variable, state id and user of a scenario is set in,
// keyed the way `hueKeyOfSpan` keys them: the Examples table's
// columns first, left to right, then the rest in the order they first
// appear across the steps, each kind from its own palette.
export const huesOfScenario = (
  columns: string[],
  steps: feature_pb.Step[]
): Map<string, number> => {
  const hues = new Map<string, number>();
  const counts = { variable: 0, state: 0, user: 0 };
  const assign = (key: string) => {
    if (hues.has(key)) {
      return;
    }
    if (key.startsWith("state:")) {
      hues.set(key, STATE_ID_HUES[counts.state % STATE_ID_HUES.length]);
      counts.state += 1;
    } else if (key.startsWith("user:")) {
      hues.set(key, USER_HUES[counts.user % USER_HUES.length]);
      counts.user += 1;
    } else {
      hues.set(key, VARIABLE_HUES[counts.variable % VARIABLE_HUES.length]);
      counts.variable += 1;
    }
  };
  for (const column of columns) {
    assign(hueKeyOfVariable(column));
  }
  for (const step of steps) {
    for (const span of spansOfStep(step)) {
      const key = hueKeyOfSpan(span);
      if (key !== undefined) {
        assign(key);
      }
    }
  }
  return hues;
};

// The columns of a scenario's Examples tables: each table's header
// row, in order.
export const columnsOfExamples = (examples: feature_pb.Examples[]): string[] =>
  examples.flatMap((example) => example.table?.rows[0]?.cells ?? []);
