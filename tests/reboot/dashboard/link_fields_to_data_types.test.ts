// `api_reader.py` writes the state types and
// `link_fields_to_data_types.ts` walks them. The build generates
// `state_types` by running the real reader over `api/`, so the tests
// below fail when either side drifts from the other.
import { describe, expect, it } from "vitest";
import { Declarations } from "../../../rbt/dashboard/v1/dashboard_pb";
import {
  fieldsOfDataType,
  fieldsOfState,
  formatType,
  linkDataTypes,
} from "../../../reboot/dashboard/frontend/src/link_fields_to_data_types";
import declarationsJson from "./state_types";

// The reader prints proto JSON, which the generated class reads: the
// state types, the data types and the schemas the page walks.
const declarations = Declarations.fromJson(
  declarationsJson as Parameters<typeof Declarations.fromJson>[0]
);
const stateTypes = declarations.stateTypes;

const linkedDataTypesById = () =>
  new Map(
    linkDataTypes(declarations).map((linkedDataType) => [
      linkedDataType.id,
      linkedDataType,
    ])
  );

describe("the type spelling the changelog shares with the fields table", () => {
  it("spells every field of every model the way the table does", () => {
    // Every model the reader declarations, with the rows the table
    // makes of it: the spelling of each row's type is what
    // `formatType` must give for that property's type, an optional
    // field's `| null` aside, which the table shows as a column
    // rather than in the type.
    const models = Object.entries(declarations.schemas).map(
      ([name, schema]) => ({
        schema,
        rows: fieldsOfDataType({ ...declarations, name }),
      })
    );
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
    const [shop] = stateTypes;

    const remaining = shop.methods.find(
      (method) => method.name === "remaining"
    );
    expect(remaining?.response?.name).toBe("shop.v1.shop.StockResponse");

    const fields = fieldsOfDataType({
      ...declarations,
      name: remaining!.response!.name,
    });
    const items = fields.find((field) => field.name === "items");

    // A field row names its element type and links to that type's
    // definition instead of inlining its fields.
    expect(items?.type).toBe("Item[]");
    expect(items?.link).toBe("shop.v1.Item");

    const shelves = fields.find((field) => field.name === "shelves");
    expect(shelves?.type).toBe("Item[][]");
    expect(shelves?.link).toBe("shop.v1.Item");
  });

  it("spells a free-form map by its value type", () => {
    const request = linkedDataTypesById().get("shop.v1.StockRequest")!;
    const labels = request.fields.find((field) => field.name === "labels")!;

    expect(labels.type).toBe("Record<string, string>");
    expect(labels.link).toBeUndefined();
  });

  it("spells what a value must satisfy beyond its type", () => {
    const request = linkedDataTypesById().get("shop.v1.StockRequest")!;
    const quantity = request.fields.find((field) => field.name === "quantity")!;

    expect(quantity.constraints).toBe(">= 0");
    expect(quantity.deprecated).toBe(false);
  });

  it("makes an error's fields readable, not just its name", () => {
    const [shop] = stateTypes;

    const remaining = shop.methods.find(
      (method) => method.name === "remaining"
    );
    const [error] = remaining!.errors;

    expect(error.name).toBe("shop.v1.shop.OutOfStockError");
    expect(
      fieldsOfDataType({ ...declarations, name: error.name }).map(
        (field) => field.name
      )
    ).toEqual(["item"]);
  });
});

describe("the data types the description carries", () => {
  it("carries types that nothing names", () => {
    // `Item` and `Price` appear only as fields of other types; no method
    // names them, so the description must follow field references to
    // reach them.
    const linkedDataTypes = linkedDataTypesById();

    expect(linkedDataTypes.has("shop.v1.Item")).toBe(true);
    expect(linkedDataTypes.has("shop.v1.Price")).toBe(true);
  });

  it("leaves out the state types' own state", () => {
    expect(linkedDataTypesById().has("shop.v1.ShopState")).toBe(false);
    // The state page shows the state model's fields.
    expect(
      fieldsOfState({ ...declarations, stateType: stateTypes[0] }).map(
        (field) => field.name
      )
    ).toEqual(["name", "open"]);
  });

  it("links a contained type rather than opening it", () => {
    const item = linkedDataTypesById().get("shop.v1.Item")!;

    expect(
      item.fields.map((field) => [field.name, field.type, field.link])
    ).toEqual([
      ["name", "string", undefined],
      ["price", "Price", "shop.v1.Price"],
    ]);
    // `Optional[Price]` is an optional field, not a union.
    expect(item.fields[1].optional).toBe(true);
  });

  it("follows a model containing a model containing a model", () => {
    // Reach each type through the previous field's `link`, as a reader
    // following the page does, so the test fails if a link names a type
    // that `linkedDataTypesById()` leaves out.
    const [shop] = stateTypes;
    const linkedDataTypes = linkedDataTypesById();

    const remaining = shop.methods.find(
      (method) => method.name === "remaining"
    );
    const items = fieldsOfDataType({
      ...declarations,
      name: remaining!.response!.name,
    }).find((field) => field.name === "items");
    expect(items?.link).toBe("shop.v1.Item");

    const price = linkedDataTypes
      .get(items!.link!)!
      .fields.find((field) => field.name === "price");
    expect(price?.link).toBe("shop.v1.Price");

    expect(
      linkedDataTypes.get(price!.link!)!.fields.map((field) => field.name)
    ).toEqual(["currency", "cents"]);
  });

  it("says what contains each type, so it reads both ways", () => {
    const linkedDataTypes = linkedDataTypesById();

    expect(
      linkedDataTypes
        .get("shop.v1.Price")!
        .referrers.map((referrer) => referrer.label)
    ).toEqual(["Item.price"]);

    // Two methods take `StockRequest`, and no response field contains it.
    expect(
      linkedDataTypes
        .get("shop.v1.StockRequest")!
        .referrers.map((referrer) => referrer.label)
    ).toEqual(["Shop.stock (takes)", "Shop.remaining (takes)"]);

    // `shelves` is `Item[][]`: a field refers to `Item` from any list
    // depth.
    expect(
      linkedDataTypes
        .get("shop.v1.Item")!
        .referrers.map((referrer) => referrer.label)
    ).toEqual(["StockResponse.items", "StockResponse.shelves"]);
  });

  it("points a referrer at something the page can show", () => {
    const stateTypeNames = new Set(
      stateTypes.map((stateType) => stateType.name)
    );
    const linkedDataTypes = linkedDataTypesById();

    for (const linkedDataType of linkedDataTypes.values()) {
      for (const referrer of linkedDataType.referrers) {
        expect(
          stateTypeNames.has(referrer.id) || linkedDataTypes.has(referrer.id),
          `${linkedDataType.id} is contained by ${referrer.id}, which is on neither page`
        ).toBe(true);
      }
    }
  });
});
