// The call graph's data: what the static analysis in
// `ImplementationMethods` will provide, joined with what the API
// already provides, into the shape the graph page draws.
//
// The analysis side is being built on another branch, so
// `SYNTHETIC_API` and `SYNTHETIC_SERVICERS` below stand in for
// `APIMethods.Get` and `ImplementationMethods.Get`. They describe
// the real `bank-pydantic` example, spelled the way
// `rbt/dashboard/v1/dashboard.proto` on that branch spells it
// (`StateTypeInfo`, `ServicerInfo`), so that swapping the mock for
// the real read is a change of source, not of shape.

// `MethodInfo.kind`, from the API side: what a method does to state.
export type MethodKind = "reader" | "writer" | "transaction" | "workflow";

// `ServicerInfo.Method.Call.How`: how a call is reached.
export type How =
  | "call"
  | "construct"
  | "schedule"
  | "spawn"
  | "reactively"
  | "until"
  | "read"
  | "write";

// One call a method's body makes. `method` is empty for `read` and
// `write`, which name no method: they touch the state itself.
export interface Call {
  stateType: string;
  method: string;
  how: How;
}

export interface ServicerMethod {
  name: string;
  calls: Call[];
  // The helpers the method hands its context to, which the analysis
  // cannot see into. Calls may hide there.
  ambiguous: string[];
}

export interface ServicerInfo {
  stateType: string;
  file: string;
  methods: ServicerMethod[];
}

// The slice of `StateTypeInfo`/`MethodInfo` the graph needs: which
// methods exist and what kind each is, which is where a method's
// colour comes from.
export interface ApiMethod {
  name: string;
  kind: MethodKind;
  factory?: boolean;
}

export interface ApiStateType {
  name: string;
  file: string;
  methods: ApiMethod[];
}

// ---------------------------------------------------------------
// The joined shape the page draws.

export interface GraphMethod {
  // `bank.v1.Bank.transfer`: unique across the application, so a
  // click can name exactly one method.
  id: string;
  name: string;
  kind: MethodKind;
  factory: boolean;
  calls: Call[];
  ambiguous: string[];
}

export interface GraphStateType {
  // The fully qualified name, `bank.v1.Account`.
  id: string;
  // The last segment, `Account`.
  name: string;
  pkg: string;
  file: string;
  methods: GraphMethod[];
}

export interface GraphPackage {
  name: string;
  stateTypes: GraphStateType[];
}

export const packageOf = (stateType: string): string =>
  stateType.split(".").slice(0, -1).join(".");

export const typeNameOf = (stateType: string): string =>
  stateType.split(".").pop() ?? stateType;

export const methodIdOf = (stateType: string, method: string): string =>
  `${stateType}.${method}`;

// Joins the two reads into packages of state types whose methods
// carry both their kind and their calls. A state type no servicer
// was found for, such as one from the standard library, still
// appears with its methods and no calls: it is called into, and the
// graph has to have somewhere for those edges to land.
export const packagesOf = (
  api: ApiStateType[],
  servicers: ServicerInfo[]
): GraphPackage[] => {
  const calls = new Map<string, ServicerMethod>();
  for (const servicer of servicers) {
    for (const method of servicer.methods) {
      calls.set(methodIdOf(servicer.stateType, method.name), method);
    }
  }

  const packages = new Map<string, GraphStateType[]>();
  for (const stateType of api) {
    const pkg = packageOf(stateType.name);
    const graphStateType: GraphStateType = {
      id: stateType.name,
      name: typeNameOf(stateType.name),
      pkg,
      file: stateType.file,
      methods: stateType.methods.map((method) => {
        const analyzed = calls.get(methodIdOf(stateType.name, method.name));
        return {
          id: methodIdOf(stateType.name, method.name),
          name: method.name,
          kind: method.kind,
          factory: method.factory ?? false,
          calls: analyzed?.calls ?? [],
          ambiguous: analyzed?.ambiguous ?? [],
        };
      }),
    };
    const held = packages.get(pkg);
    if (held === undefined) {
      packages.set(pkg, [graphStateType]);
    } else {
      held.push(graphStateType);
    }
  }

  return [...packages.entries()].map(([name, stateTypes]) => ({
    name,
    stateTypes,
  }));
};

// ---------------------------------------------------------------
// The synthetic data: a bank, the size an application gets once it
// has been running for a while.
//
// `bank.v1` is the real `bank-pydantic` example, its calls read from
// `backend/src/*.py`, with one liberty taken: `Customer.reconcile`, a
// workflow, does not exist there. Everything around it, payments,
// ledger, lending, compliance, notifications, reporting and support,
// is invented so the graph can be seen at the size it has to work
// at, and written the way such an application would really be: each
// package owns its own state types, work crosses packages through
// named methods, long-running work is a scheduled or spawned
// workflow, and the standard library is reached for instead of
// hand-rolled.
//
// One line per method: the kind, `!` if it is a factory, then after
// `->` the calls it makes, and after `?` the helpers it hands its
// context to. A call is `Type.method`, with a bare `Type` meaning a
// state type in the same package and a dotted one already
// qualified; `:how` says how it is reached when not a plain call;
// `self:read` / `self:write` are a workflow's inline touches of its
// own state.
type Spec = Record<string, Record<string, Record<string, string>>>;

const APPLICATION: Spec = {
  "bank.v1": {
    Bank: {
      create: "transaction! -> rbt.std.collections.v1.SortedMap.insert",
      sign_up:
        "transaction -> Customer.sign_up:construct, " +
        "rbt.std.collections.v1.SortedMap.insert, " +
        "bank.compliance.v1.KycCheck.start:construct",
      all_customer_ids: "reader -> rbt.std.collections.v1.SortedMap.range",
      transfer:
        "transaction -> Account.withdraw, Account.deposit, " +
        "bank.ledger.v1.Ledger.post",
      open_customer_account: "transaction -> Customer.open_account",
      account_balances:
        "reader -> rbt.std.collections.v1.SortedMap.range, " +
        "Customer.balances ? balances_of",
      close_customer:
        "transaction -> Customer.close, " +
        "rbt.std.collections.v1.SortedMap.remove",
    },
    Account: {
      open: "writer! -> Account.interest:schedule",
      balance: "reader",
      deposit: "writer",
      withdraw: "writer",
      // Interest compounds: each run schedules the next.
      interest: "writer -> Account.interest:schedule",
      freeze: "writer",
      history: "reader -> bank.ledger.v1.Ledger.entries",
      close: "writer -> bank.reporting.v1.Statement.generate:construct",
    },
    Customer: {
      sign_up: "writer!",
      open_account:
        "transaction -> Account.open:construct, Account.deposit, " +
        "Customer.reconcile:spawn",
      balances: "reader -> Account.balance",
      reconcile: "workflow -> self:read, Account.balance:until, self:write",
      profile: "reader",
      update_profile:
        "writer -> bank.notifications.v1.Notification.create:construct",
      close: "transaction -> Account.close",
    },
    User: {
      create: "transaction! -> Bank.sign_up",
      open_account: "transaction -> Customer.open_account",
      balances: "reader -> Customer.balances",
      change_password: "writer -> bank.compliance.v1.AuditLog.record",
      sessions: "reader",
    },
  },

  "bank.payments.v1": {
    Payment: {
      initiate:
        "transaction! -> bank.v1.Account.withdraw, " +
        "bank.compliance.v1.AmlMonitor.screen, Payment.settle:schedule",
      settle:
        "writer -> bank.v1.Account.deposit, bank.ledger.v1.Ledger.post, " +
        "bank.notifications.v1.Notification.create:construct",
      fail:
        "writer -> bank.v1.Account.deposit, " +
        "bank.notifications.v1.Notification.create:construct",
      refund:
        "transaction -> bank.v1.Account.withdraw, bank.v1.Account.deposit, " +
        "bank.ledger.v1.Ledger.post",
      status: "reader",
    },
    StandingOrder: {
      create: "writer! -> StandingOrder.run:schedule",
      run: "writer -> Payment.initiate:construct, StandingOrder.run:schedule",
      cancel: "writer",
      next_run: "reader",
    },
    Card: {
      issue:
        "transaction! -> bank.v1.Account.balance, " +
        "bank.notifications.v1.Notification.create:construct",
      authorize:
        "transaction -> bank.v1.Account.balance, " +
        "bank.compliance.v1.AmlMonitor.screen, Card.capture:schedule",
      capture: "writer -> bank.v1.Account.withdraw, bank.ledger.v1.Ledger.post",
      block: "writer -> bank.notifications.v1.Notification.create:construct",
      transactions: "reader -> bank.ledger.v1.Ledger.entries",
    },
    Merchant: {
      register: "writer! -> bank.compliance.v1.KycCheck.start:construct",
      settle:
        "workflow -> Settlement.open:construct, Settlement.close, " +
        "bank.v1.Account.deposit, Merchant.settle:schedule",
      payouts: "reader -> Settlement.report ? payout_for",
    },
    Settlement: {
      open: "writer!",
      add: "writer",
      close: "transaction -> bank.ledger.v1.Ledger.post",
      report: "reader",
    },
  },

  "bank.ledger.v1": {
    Ledger: {
      create: "writer!",
      post: "transaction -> JournalEntry.record:construct",
      entries: "reader -> rbt.std.collections.v1.SortedMap.range",
      balance: "reader",
    },
    JournalEntry: {
      record: "writer! -> rbt.std.collections.v1.SortedMap.insert",
      reverse: "transaction -> JournalEntry.record:construct",
      detail: "reader",
    },
    Reconciliation: {
      start: "writer! -> Reconciliation.run:spawn",
      run:
        "workflow -> Ledger.balance, bank.v1.Account.balance, self:write, " +
        "Reconciliation.flag",
      flag:
        "writer -> bank.compliance.v1.AuditLog.record, " +
        "bank.notifications.v1.Notification.create:construct",
      result: "reader",
    },
  },

  "bank.lending.v1": {
    LoanApplication: {
      submit:
        "transaction! -> CreditScore.compute:construct, " +
        "LoanApplication.assess:spawn",
      assess:
        "workflow -> CreditScore.score, bank.compliance.v1.KycCheck.result, " +
        "self:write, LoanApplication.decide",
      decide:
        "transaction -> Loan.originate:construct, " +
        "bank.notifications.v1.Notification.create:construct",
      reject: "writer -> bank.notifications.v1.Notification.create:construct",
      status: "reader",
    },
    Loan: {
      originate:
        "transaction! -> bank.v1.Account.deposit, bank.ledger.v1.Ledger.post, " +
        "RepaymentSchedule.build:construct, Loan.accrue:schedule",
      accrue: "writer -> bank.ledger.v1.Ledger.post, Loan.accrue:schedule",
      repay:
        "transaction -> bank.v1.Account.withdraw, bank.ledger.v1.Ledger.post, " +
        "RepaymentSchedule.mark_paid",
      balance: "reader",
      delinquent: "reader -> RepaymentSchedule.next_due",
      close:
        "writer -> Collateral.release, " +
        "bank.notifications.v1.Notification.create:construct",
    },
    CreditScore: {
      compute:
        "writer! -> bank.v1.Customer.balances, bank.ledger.v1.Ledger.entries, " +
        "CreditScore.refresh:schedule ? bureau_lookup",
      refresh:
        "writer -> bank.v1.Customer.balances, CreditScore.refresh:schedule " +
        "? bureau_lookup",
      score: "reader",
    },
    RepaymentSchedule: {
      build: "writer!",
      mark_paid: "writer",
      next_due: "reader",
      remaining: "reader",
    },
    Collateral: {
      pledge: "writer! -> bank.compliance.v1.AuditLog.record",
      release: "writer -> bank.compliance.v1.AuditLog.record",
      value: "reader",
    },
  },

  "bank.compliance.v1": {
    KycCheck: {
      start: "writer! -> KycCheck.verify:spawn",
      verify:
        "workflow -> SanctionsList.lookup, self:write, KycCheck.escalate " +
        "? document_check",
      escalate:
        "writer -> bank.support.v1.Ticket.open:construct, AuditLog.record",
      result: "reader",
    },
    AmlMonitor: {
      create: "writer!",
      screen: "writer -> SanctionsList.lookup, AmlMonitor.flag",
      flag:
        "transaction -> bank.v1.Account.freeze, AuditLog.record, " +
        "bank.support.v1.Ticket.open:construct",
      alerts: "reader",
    },
    SanctionsList: {
      load: "writer! -> SanctionsList.refresh:schedule",
      refresh:
        "writer -> rbt.std.collections.v1.SortedMap.insert, " +
        "SanctionsList.refresh:schedule ? fetch_feed",
      lookup: "reader -> rbt.std.collections.v1.SortedMap.get",
    },
    AuditLog: {
      create: "writer!",
      record: "writer -> rbt.std.collections.v1.SortedMap.insert",
      entries: "reader -> rbt.std.collections.v1.SortedMap.range",
      purge: "writer -> rbt.std.collections.v1.SortedMap.remove",
    },
  },

  "bank.notifications.v1": {
    Notification: {
      create: "writer! -> Preferences.get, Outbox.enqueue",
      retry: "writer -> Outbox.enqueue",
      cancel: "writer",
      status: "reader",
    },
    Preferences: {
      create: "writer!",
      update: "writer",
      get: "reader",
    },
    Outbox: {
      create: "writer! -> Outbox.drain:spawn",
      enqueue: "writer -> rbt.std.collections.queue.v1.Queue.enqueue",
      drain:
        "workflow -> rbt.std.collections.queue.v1.Queue.dequeue, self:write " +
        "? send_email, send_sms",
      pending: "reader -> rbt.std.collections.queue.v1.Queue.empty",
    },
    Digest: {
      create: "writer! -> Digest.compile:schedule",
      compile:
        "writer -> bank.v1.Customer.balances, bank.reporting.v1.Statement.lines, " +
        "Notification.create:construct, Digest.compile:schedule",
      unsubscribe: "writer",
    },
  },

  "bank.reporting.v1": {
    Statement: {
      generate:
        "writer! -> bank.ledger.v1.Ledger.entries, Statement.finalize:schedule",
      lines: "reader",
      finalize: "writer -> bank.notifications.v1.Notification.create:construct",
    },
    MonthlyReport: {
      build: "writer! -> MonthlyReport.compile:spawn",
      compile:
        "workflow -> bank.v1.Bank.all_customer_ids, bank.v1.Customer.balances, " +
        "Metrics.snapshot, self:write",
      summary: "reader",
    },
    Metrics: {
      create: "writer! -> Metrics.rollup:schedule",
      record: "writer -> rbt.std.pubsub.v1.Topic.publish",
      snapshot: "reader",
      rollup: "writer -> Metrics.rollup:schedule",
    },
  },

  "bank.support.v1": {
    Ticket: {
      open:
        "writer! -> Agent.assign, " +
        "bank.notifications.v1.Notification.create:construct",
      reply: "writer -> bank.notifications.v1.Notification.create:construct",
      escalate: "writer -> Agent.assign",
      close: "transaction -> Agent.release",
      history: "reader",
    },
    Dispute: {
      file: "transaction! -> Ticket.open:construct, Dispute.investigate:spawn",
      investigate:
        "workflow -> bank.payments.v1.Payment.status, " +
        "bank.ledger.v1.Ledger.entries, self:write, Dispute.resolve",
      resolve:
        "transaction -> bank.payments.v1.Payment.refund, Ticket.close, " +
        "bank.notifications.v1.Notification.create:construct",
      status: "reader",
    },
    Agent: {
      create: "writer!",
      assign: "writer",
      release: "writer",
      workload: "reader",
    },
  },

  // The standard library, as the API sees it: called into, with no
  // servicer of its own here.
  "rbt.std.collections.v1": {
    SortedMap: {
      insert: "writer",
      remove: "writer",
      get: "reader",
      range: "reader",
      reverse_range: "reader",
    },
  },
  "rbt.std.collections.queue.v1": {
    Queue: {
      enqueue: "transaction",
      dequeue: "workflow",
      try_dequeue: "transaction",
      empty: "reader",
    },
  },
  "rbt.std.pubsub.v1": {
    Topic: {
      publish: "writer",
      subscribe: "writer",
      broker: "workflow",
    },
  },
};

const isStandardLibrary = (pkg: string): boolean => pkg.startsWith("rbt.");

const snakeOf = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

// `bank.v1.Account` is declared in `api/bank/v1/account.py` and
// implemented in `backend/src/account_servicer.py`, the way the
// example lays its files out; the standard library's live under
// `rbt/`.
const apiFileOf = (pkg: string, type: string): string => {
  const path = `${pkg.split(".").join("/")}/${snakeOf(type)}.py`;
  return isStandardLibrary(pkg) ? path : `api/${path}`;
};

const servicerFileOf = (type: string): string =>
  `backend/src/${snakeOf(type)}_servicer.py`;

const parseCall = (pkg: string, type: string, text: string): Call => {
  const [ref, how = "call"] = text.split(":");
  if (ref === "self") {
    return { stateType: `${pkg}.${type}`, method: "", how: how as How };
  }
  const dot = ref.lastIndexOf(".");
  const target = ref.slice(0, dot);
  const method = ref.slice(dot + 1);
  const stateType = target.includes(".") ? target : `${pkg}.${target}`;
  return { stateType, method, how: how as How };
};

const parseMethod = (
  pkg: string,
  type: string,
  name: string,
  spec: string
): { api: ApiMethod; servicer: ServicerMethod } => {
  const [body, helpers = ""] = spec.split(" ? ");
  const [head, calls = ""] = body.split(" -> ");
  const factory = head.endsWith("!");
  const kind = (factory ? head.slice(0, -1) : head) as MethodKind;
  const list = (text: string) =>
    text
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  return {
    api: { name, kind, ...(factory ? { factory } : {}) },
    servicer: {
      name,
      calls: list(calls).map((call) => parseCall(pkg, type, call)),
      ambiguous: list(helpers),
    },
  };
};

const synthesize = (
  spec: Spec
): { api: ApiStateType[]; servicers: ServicerInfo[] } => {
  const api: ApiStateType[] = [];
  const servicers: ServicerInfo[] = [];
  for (const [pkg, types] of Object.entries(spec)) {
    for (const [type, methods] of Object.entries(types)) {
      const parsed = Object.entries(methods).map(([name, text]) =>
        parseMethod(pkg, type, name, text)
      );
      api.push({
        name: `${pkg}.${type}`,
        file: apiFileOf(pkg, type),
        methods: parsed.map((method) => method.api),
      });
      if (!isStandardLibrary(pkg)) {
        servicers.push({
          stateType: `${pkg}.${type}`,
          file: servicerFileOf(type),
          methods: parsed.map((method) => method.servicer),
        });
      }
    }
  }
  return { api, servicers };
};

const SYNTHESIZED = synthesize(APPLICATION);

export const SYNTHETIC_API: ApiStateType[] = SYNTHESIZED.api;

export const SYNTHETIC_SERVICERS: ServicerInfo[] = SYNTHESIZED.servicers;

export const SYNTHETIC_PACKAGES: GraphPackage[] = packagesOf(
  SYNTHETIC_API,
  SYNTHETIC_SERVICERS
);
