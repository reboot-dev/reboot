// The graph draws every method the code calls, declared by an API
// file or not, and clicking a row names that method in the `type`
// search parameter. The page reads the parameter back to decide
// which method is chosen, so the graph lights it and the pane shows
// it. These tests follow one click from the row to that decision,
// for a declared method and for one the graph knows only from a
// call.
import { describe, expect, it } from "vitest";
import {
  Servicer,
  Servicer_Method_Call_How,
} from "../../../rbt/dashboard/v1/dashboard_pb";
import * as api_pb from "../../../rbt/v1alpha1/api/api_pb";
import { joinStateTypes, methodId } from "../../../reboot/dashboard/web/src/callgraph";
import type { APIs } from "../../../reboot/dashboard/web/src/link_properties_to_data_types";
import { linkDataTypes } from "../../../reboot/dashboard/web/src/link_properties_to_data_types";
import {
  chosenMethodIdOf,
  isGraphStateTypeId,
  paneTargetOf,
  searchOfType,
} from "../../../reboot/dashboard/web/src/pane_target";
import apiJson from "./state_types";

// The shop API declares one state type, `Shop`, with a `stock`
// method.
const apis: APIs = {
  "shop/v1/shop.py": api_pb.API.fromJson(
    apiJson as Parameters<typeof api_pb.API.fromJson>[0]
  ),
};
const SHOP = "shop.v1.Shop";

// A state type no API file of the application declares, only called:
// the standard library's ordered map.
const ORDERED_MAP = "rbt.std.collections.v1.OrderedMap";

// What analyzing the application's code found: `Shop.stock` inserts
// into an ordered map.
const servicers = [
  new Servicer({
    stateType: SHOP,
    filename: "backend/src/shop_servicer.py",
    methods: [
      {
        name: "stock",
        calls: [
          {
            stateType: ORDERED_MAP,
            method: "Insert",
            how: Servicer_Method_Call_How.CALL,
          },
        ],
      },
    ],
  }),
];

const graph = joinStateTypes(apis, servicers);

// The predicates the page hands `paneTargetOf`.
const isStateTypeId = isGraphStateTypeId(graph);
const linkedDataTypeIds = new Set(
  linkDataTypes({ apis }).map((linkedDataType) => linkedDataType.id)
);
const isDataTypeId = (id: string): boolean => linkedDataTypeIds.has(id);

// What the page decides is chosen after a click on the row of the
// method with the given id: the click navigates to `searchOfType(id)`
// and the page reads the `type` parameter back out of it.
const chosenAfterClicking = (id: string) => {
  const typeParameter = new URLSearchParams(searchOfType(id)).get("type");
  const target = paneTargetOf(typeParameter, isStateTypeId, isDataTypeId);
  return { target, chosenMethodId: chosenMethodIdOf(target) };
};

describe("the graph's rows", () => {
  it("include the declared method", () => {
    const shop = graph.find((stateType) => stateType.id === SHOP);
    expect(shop?.methods.map((method) => method.name)).toContain("stock");
  });

  it("include the called method no API file declares", () => {
    const orderedMap = graph.find((stateType) => stateType.id === ORDERED_MAP);
    expect(orderedMap?.methods.map((method) => method.name)).toEqual([
      "Insert",
    ]);
  });
});

describe("clicking a row", () => {
  it("chooses a declared method", () => {
    const id = methodId(SHOP, "stock");
    expect(chosenAfterClicking(id)).toEqual({
      target: { stateTypeId: SHOP, method: "stock" },
      chosenMethodId: id,
    });
  });

  it("chooses a method the graph knows only from a call", () => {
    const id = methodId(ORDERED_MAP, "Insert");
    expect(chosenAfterClicking(id)).toEqual({
      target: { stateTypeId: ORDERED_MAP, method: "Insert" },
      chosenMethodId: id,
    });
  });
});
