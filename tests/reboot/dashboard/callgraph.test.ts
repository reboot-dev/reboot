// The call graph's questions about one method: who calls it directly,
// whether it calls itself, and what it calls, transitively.
import { describe, expect, it } from "vitest";
import { Servicer_Method_Call_How } from "../../../rbt/dashboard/v1/dashboard_pb";
import type {
  GraphCall,
  GraphStateType,
  MethodInGraph,
} from "../../../reboot/dashboard/web/src/callgraph";
import {
  calleeDistancesFrom,
  callsItself,
  directCallers,
  methodId,
} from "../../../reboot/dashboard/web/src/callgraph";

const call = (
  stateTypeName: string,
  methodName: string,
  how = Servicer_Method_Call_How.CALL
): GraphCall => ({ stateTypeName, methodName, how, count: 1 });

// Three state types in a chain, `A.a` calling `B.b` calling `C.c`,
// with `C.c` scheduling itself and `C.d` called by nothing.
const graph: GraphStateType[] = [
  {
    id: "app.v1.A",
    name: "A",
    methods: [{ name: "a", factory: false, calls: [call("app.v1.B", "b")] }],
  },
  {
    id: "app.v1.B",
    name: "B",
    methods: [{ name: "b", factory: false, calls: [call("app.v1.C", "c")] }],
  },
  {
    id: "app.v1.C",
    name: "C",
    methods: [
      {
        name: "c",
        factory: false,
        calls: [call("app.v1.C", "c", Servicer_Method_Call_How.SCHEDULE)],
      },
      { name: "d", factory: false, calls: [] },
    ],
  },
];

const A_a = methodId("app.v1.A", "a");
const B_b = methodId("app.v1.B", "b");
const C_c = methodId("app.v1.C", "c");
const C_d = methodId("app.v1.C", "d");

const idsOf = (methods: MethodInGraph[]): string[] =>
  methods.map(({ stateType, name }) => methodId(stateType.id, name));

describe("a method's direct callers", () => {
  it("are the methods that call it, not the methods calling those", () => {
    expect(idsOf(directCallers(B_b, graph))).toEqual([A_a]);
  });

  it("include the method itself when it calls itself", () => {
    expect(idsOf(directCallers(C_c, graph))).toEqual([B_b, C_c]);
  });

  it("are none for a method nothing calls", () => {
    expect(directCallers(A_a, graph)).toEqual([]);
    expect(directCallers(C_d, graph)).toEqual([]);
  });
});

describe("whether a method calls itself", () => {
  it("is told by its own calls", () => {
    expect(callsItself(C_c, graph)).toBe(true);
    expect(callsItself(B_b, graph)).toBe(false);
    expect(callsItself(C_d, graph)).toBe(false);
  });

  it("is not told by the distances, which put it at zero from itself", () => {
    expect(calleeDistancesFrom(C_c, graph)).toEqual(new Map([[C_c, 0]]));
  });
});

describe("the methods a method calls", () => {
  it("reach out transitively, each a call further away", () => {
    expect(calleeDistancesFrom(A_a, graph)).toEqual(
      new Map([
        [A_a, 0],
        [B_b, 1],
        [C_c, 2],
      ])
    );
  });
});
