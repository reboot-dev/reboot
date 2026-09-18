// The features page lists the methods no feature describes, so the
// developer knows what behavior is still unspecified. Of the two
// methods Reboot adds to an auto-constructed `User`, `set_claims`
// stores what a sign-in verified, which no feature describes, so the
// list leaves it out; `create` is where a servicer gives a new user
// its state, so the list keeps it.
import { describe, expect, it } from "vitest";
import * as api_pb from "../../../rbt/v1alpha1/api/api_pb";
import { joinStateTypes } from "../../../reboot/dashboard/web/src/callgraph";
import { undescribedMethods } from "../../../reboot/dashboard/web/src/features";

const writer = (name: string, factory = false): api_pb.Method =>
  new api_pb.Method({
    name,
    factory,
    kind: { case: "writer", value: new api_pb.Writer() },
  });

// A `User` Reboot auto-constructs, with the `create` and `set_claims`
// it adds, beside a `Todo` whose own factory is also named `create`.
const apis = {
  "todo/v1/todo.py": new api_pb.API({
    filename: "todo/v1/todo.py",
    package: "todo.v1",
    module: "todo.v1.todo",
    stateTypes: [
      new api_pb.StateType({
        name: "User",
        autoConstruct: true,
        methods: [
          writer("create", true),
          writer("set_claims"),
          writer("add_todo"),
        ],
      }),
      new api_pb.StateType({
        name: "Todo",
        methods: [writer("create", true), writer("complete")],
      }),
    ],
  }),
};

describe("the methods no feature describes", () => {
  it("leave out `set_claims`, and keep `create`", () => {
    const graph = joinStateTypes(apis, []);
    expect(
      undescribedMethods([], graph).map(({ stateType, methods }) => [
        stateType.id,
        methods,
      ])
    ).toEqual([
      ["todo.v1.User", ["create", "add_todo"]],
      ["todo.v1.Todo", ["create", "complete"]],
    ]);
  });
});
