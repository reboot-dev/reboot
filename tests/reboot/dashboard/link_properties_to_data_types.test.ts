// `api_reader.py` writes what an API file declares and
// `link_properties_to_data_types.ts` walks it. The build generates
// `state_types` by running the real reader over `api/`, so the tests
// below fail when either side drifts from the other.
import { describe, expect, it } from "vitest";
import * as api_pb from "../../../rbt/v1alpha1/api/api_pb";
import type { APIs } from "../../../reboot/dashboard/web/src/link_properties_to_data_types";
import {
  propertiesOfDataType,
  propertiesOfState,
  formatType,
  linkDataTypes,
  packageOfStateTypeName,
  qualifiedName,
} from "../../../reboot/dashboard/web/src/link_properties_to_data_types";
import protoPartsApiJson from "./proto_parts_state_types";
import protoApiJson from "./proto_state_types";
import apiJson from "./state_types";

// The reader prints proto JSON, which the generated class reads: the
// state types, the data types and the schemas the page walks, keyed
// by the file relative to the API directory, as `API.apis` keys
// them.
const apis: APIs = {
  // What the file declares, of everything reading it found.
  "shop/v1/shop.py": api_pb.API.fromJson(
    apiJson.api as Parameters<typeof api_pb.API.fromJson>[0]
  ),
};
const api = apis["shop/v1/shop.py"];
const schemas = api.schemas;

const linkedDataTypesById = () =>
  new Map(
    linkDataTypes({ apis }).map((linkedDataType) => [
      linkedDataType.id,
      linkedDataType,
    ])
  );

describe("the type spelling the changelog shares with the properties table", () => {
  it("spells every property of every model the way the table does", () => {
    // Every model the reader declares, with the rows the table makes
    // of it: the spelling of each row's type is what `formatType`
    // must give for that property's type, an optional property's
    // `| null` aside, which the table shows as a column rather than
    // in the type.
    const models = Object.entries(schemas).map(([name, schema]) => ({
      schema,
      rows: propertiesOfDataType({ apis, name }),
    }));
    expect(models.length).toBeGreaterThan(0);

    for (const { schema, rows } of models) {
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const property = schema!.properties.find(
          (candidate) => candidate.name === row.name
        );
        expect(formatType(property!.type)).toBe(
          row.optional ? `${row.type} | null` : row.type
        );
      }
    }
  });
});

describe("the description the reader writes", () => {
  it("carries nested types rather than naming them", () => {
    const [shop] = api.stateTypes;

    const remaining = shop.methods.find(
      (method) => method.name === "remaining"
    );
    expect(remaining?.response?.name).toBe("shop.v1.shop.StockResponse");

    const properties = propertiesOfDataType({
      apis,
      name: remaining!.response!.name,
    });
    const items = properties.find((property) => property.name === "items");

    // A property row names its element type and links to that type's
    // definition instead of inlining its properties.
    expect(items?.type).toBe("Item[]");
    expect(items?.link).toBe("shop.v1.shop.Item");

    const shelves = properties.find((property) => property.name === "shelves");
    expect(shelves?.type).toBe("Item[][]");
    expect(shelves?.link).toBe("shop.v1.shop.Item");
  });

  it("spells a free-form map by its value type", () => {
    const request = linkedDataTypesById().get("shop.v1.shop.StockRequest")!;
    const labels = request.properties.find(
      (property) => property.name === "labels"
    )!;

    expect(labels.type).toBe("Record<string, string>");
    expect(labels.link).toBeUndefined();
  });

  it("spells what a value must satisfy beyond its type", () => {
    const request = linkedDataTypesById().get("shop.v1.shop.StockRequest")!;
    const quantity = request.properties.find(
      (property) => property.name === "quantity"
    )!;

    expect(quantity.constraints).toBe(">= 0");
    expect(quantity.deprecated).toBe(false);
  });

  it("makes an error's properties readable, not just its name", () => {
    const [shop] = api.stateTypes;

    const remaining = shop.methods.find(
      (method) => method.name === "remaining"
    );
    const [error] = remaining!.errors;

    expect(error.name).toBe("shop.v1.shop.OutOfStockError");
    expect(
      propertiesOfDataType({ apis, name: error.name }).map(
        (property) => property.name
      )
    ).toEqual(["item"]);
  });
});

describe("the data types the description carries", () => {
  it("carries types that nothing names", () => {
    // `Item` and `Price` appear only as properties of other types; no method
    // names them, so the description must follow property references to
    // reach them.
    const linkedDataTypes = linkedDataTypesById();

    expect(linkedDataTypes.has("shop.v1.shop.Item")).toBe(true);
    expect(linkedDataTypes.has("shop.v1.shop.Price")).toBe(true);
  });

  it("leaves out the state types' own state", () => {
    expect(linkedDataTypesById().has("shop.v1.shop.ShopState")).toBe(false);
    // The state page shows the state model's properties.
    expect(
      propertiesOfState({ apis, stateType: api.stateTypes[0] }).map(
        (property) => property.name
      )
    ).toEqual(["name", "open"]);
  });

  it("links a contained type rather than opening it", () => {
    const item = linkedDataTypesById().get("shop.v1.shop.Item")!;

    expect(
      item.properties.map((property) => [
        property.name,
        property.type,
        property.link,
      ])
    ).toEqual([
      ["name", "string", undefined],
      ["price", "Price", "shop.v1.shop.Price"],
    ]);
    // `Optional[Price]` is an optional property, not a union.
    expect(item.properties[1].optional).toBe(true);
  });

  it("follows a model containing a model containing a model", () => {
    // Reach each type through the previous property's `link`, as a reader
    // following the page does, so the test fails if a link names a type
    // that `linkedDataTypesById()` leaves out.
    const [shop] = api.stateTypes;
    const linkedDataTypes = linkedDataTypesById();

    const remaining = shop.methods.find(
      (method) => method.name === "remaining"
    );
    const items = propertiesOfDataType({
      apis,
      name: remaining!.response!.name,
    }).find((property) => property.name === "items");
    expect(items?.link).toBe("shop.v1.shop.Item");

    const price = linkedDataTypes
      .get(items!.link!)!
      .properties.find((property) => property.name === "price");
    expect(price?.link).toBe("shop.v1.shop.Price");

    expect(
      linkedDataTypes
        .get(price!.link!)!
        .properties.map((property) => property.name)
    ).toEqual(["currency", "cents"]);
  });

  it("says what contains each type, so it reads both ways", () => {
    const linkedDataTypes = linkedDataTypesById();

    expect(
      linkedDataTypes
        .get("shop.v1.shop.Price")!
        .referrers.map((referrer) => referrer.label)
    ).toEqual(["Item.price"]);

    // Two methods take `StockRequest`, and no response property contains it.
    expect(
      linkedDataTypes
        .get("shop.v1.shop.StockRequest")!
        .referrers.map((referrer) => referrer.label)
    ).toEqual(["Shop.stock (takes)", "Shop.remaining (takes)"]);

    // `shelves` is `Item[][]`: a property refers to `Item` from any list
    // depth.
    expect(
      linkedDataTypes
        .get("shop.v1.shop.Item")!
        .referrers.map((referrer) => referrer.label)
    ).toEqual(["StockResponse.items", "StockResponse.shelves"]);
  });

  it("points a referrer at something the page can show", () => {
    const stateTypeIds = new Set(
      api.stateTypes.map((stateType) => qualifiedName({ api, stateType }))
    );
    const linkedDataTypes = linkedDataTypesById();

    for (const linkedDataType of linkedDataTypes.values()) {
      for (const referrer of linkedDataType.referrers) {
        expect(
          stateTypeIds.has(referrer.id) || linkedDataTypes.has(referrer.id),
          `${linkedDataType.id} is contained by ${referrer.id}, which is on neither page`
        ).toBe(true);
      }
    }
  });
});

describe("the package a name belongs to", () => {
  it("drops only the class from a state type name", () => {
    expect(packageOfStateTypeName("shop.v1.Shop")).toBe("shop.v1");
  });
});

describe("what only a `.proto` declares", () => {
  // Two files: `depot.proto` refers to `Part`, which `parts.proto`
  // declares and so describes.
  const protoApis: APIs = {
    "shop/v1/depot.proto": api_pb.API.fromJson(
      protoApiJson.api as Parameters<typeof api_pb.API.fromJson>[0]
    ),
    "shop/v1/parts.proto": api_pb.API.fromJson(
      protoPartsApiJson.api as Parameters<typeof api_pb.API.fromJson>[0]
    ),
  };
  const protoApi = protoApis["shop/v1/depot.proto"];
  const linked = linkDataTypes({ apis: protoApis });

  it("spells a type as it is in JSON, with what it was declared as", () => {
    const properties = propertiesOfState({
      apis: protoApis,
      stateType: protoApi.stateTypes[0],
    });
    expect(
      properties.map((property) => [
        property.name,
        property.type,
        property.origin,
      ])
    ).toEqual([
      // A key is a string in JSON, whatever it was declared as.
      ["shelves", "Record<string, Part>", "map<uint32, Part>"],
      // JSON shows all of a `string`.
      ["manager", "string", undefined],
      ["floor_plan", "string", "bytes"],
      ["notes", "any", "Value"],
      ["delivery", "one of", undefined],
    ]);
    // A reference into another file links to what that file
    // describes.
    expect(properties[0].link).toBe("shop.v1.Part");
  });

  it("says a type on one line for the changelog", () => {
    const [capacity] = protoApi.schemas["shop.v1.DepotFullError"].properties;
    expect(formatType(capacity.type)).toBe("integer (uint32)");
  });

  it("lists a oneof's members beneath it, each linking for itself", () => {
    const delivery = propertiesOfState({
      apis: protoApis,
      stateType: protoApi.stateTypes[0],
    }).find((property) => property.name === "delivery");
    expect(delivery?.link).toBeUndefined();
    expect(delivery?.description).toBe("How the depot last received parts.");
    expect(
      delivery?.members?.map((member) => [
        member.name,
        member.type,
        member.link,
      ])
    ).toEqual([
      ["truck", "string", undefined],
      ["courier", "Courier", "shop.v1.Depot.Courier"],
    ]);
  });

  it("gives an enum a page, its values where properties would be", () => {
    const size = linked.find(
      (linkedDataType) => linkedDataType.id === "shop.v1.Part.Size"
    );
    expect(size?.kind).toBe("enum");
    expect(size?.name).toBe("Part.Size");
    // The package is the one the enum says, a proto message's name
    // carrying no module to drop.
    expect(size?.package).toBe("shop.v1");
    expect(size?.properties.map((value) => [value.name, value.type])).toEqual([
      ["SIZE_UNSPECIFIED", "0"],
      ["SMALL", "1"],
      ["LARGE", "2"],
    ]);
    expect(size?.referrers).toEqual([
      { id: "shop.v1.Part", label: "Part.size" },
    ]);
  });

  it("names a member of a oneof among what contains a data type", () => {
    const courier = linked.find(
      (linkedDataType) => linkedDataType.id === "shop.v1.Depot.Courier"
    );
    expect(courier?.kind).toBe("data type");
    expect(courier?.referrers).toEqual([
      { id: "shop.v1.Depot", label: "Depot.courier" },
    ]);
  });
});
