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
  packageOfDataTypeName,
  packageOfStateTypeName,
  qualifiedName,
} from "../../../reboot/dashboard/web/src/link_properties_to_data_types";
import apiJson from "./state_types";

// The reader prints proto JSON, which the generated class reads: the
// state types, the data types and the schemas the page walks, keyed
// by the file relative to the API directory, as `API.apis` keys
// them.
const apis: APIs = {
  "shop/v1/shop.py": api_pb.API.fromJson(
    apiJson as Parameters<typeof api_pb.API.fromJson>[0]
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
      rows: propertiesOfDataType({ api, name }),
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
      api,
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
      propertiesOfDataType({ api, name: error.name }).map(
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
      propertiesOfState({ api, stateType: api.stateTypes[0] }).map(
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
      api,
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
  it("drops the module and the class from a data type name", () => {
    expect(packageOfDataTypeName("shop.v1.shop.Item")).toBe("shop.v1");
  });

  it("drops only the class from a state type name", () => {
    expect(packageOfStateTypeName("shop.v1.Shop")).toBe("shop.v1");
  });
});
