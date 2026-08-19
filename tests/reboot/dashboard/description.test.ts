// The reader and the page agree on a shape.
//
// `api_reader.py` writes the description and `description.ts` reads
// it, and since it travels as a `google.protobuf.Value` there is no
// generated type holding the two together. This is what does instead:
// the build runs the real reader over `api/`, and parsing what it
// wrote fails if either side has drifted from the other.
import { describe, expect, it } from "vitest";
import {
  DescriptionSchema,
  dataObjects,
  fieldsOf,
} from "../../../reboot/dashboard/frontend/src/description";
import described from "./described";

const parse = () => DescriptionSchema.parse(described);

const objectsById = () =>
  new Map(dataObjects(parse()).map((object) => [object.id, object]));

describe("the description the reader writes", () => {
  it("is what this page expects", () => {
    expect(() => parse()).not.toThrow();
  });

  it("carries nested types rather than naming them", () => {
    const [shop] = parse();

    const remaining = shop.methods.find(
      (method) => method.name === "remaining"
    );
    expect(remaining?.response).toBeDefined();

    const fields = fieldsOf(shop, remaining!.response!);
    const items = fields.find((field) => field.name === "items");

    // `items` is a list of `Item`, shown one level deep: the row says
    // what it holds and links to it rather than opening it here.
    expect(items?.type).toBe("Item[]");
    expect(items?.link).toBe("shop.v1.Item");
  });

  it("makes an error's fields readable, not just its name", () => {
    const [shop] = parse();

    const remaining = shop.methods.find(
      (method) => method.name === "remaining"
    );
    const [error] = remaining!.errors;

    expect(error.$ref).toBe("#/$defs/OutOfStockError");
    expect(fieldsOf(shop, error).map((field) => field.name)).toEqual(["item"]);
  });
});

describe("the data objects the description carries", () => {
  it("carries types that nothing names", () => {
    // `Item` and `Price` are reachable only as fields. A page built
    // from what methods mention would not have them at all, which is
    // the whole point of following the references.
    const objects = objectsById();

    expect(objects.has("shop.v1.Item")).toBe(true);
    expect(objects.has("shop.v1.Price")).toBe(true);
  });

  it("leaves out the state types' own state", () => {
    expect(objectsById().has("shop.v1.ShopState")).toBe(false);
  });

  it("links a held type rather than opening it", () => {
    const item = objectsById().get("shop.v1.Item")!;

    expect(
      item.fields.map((field) => [field.name, field.type, field.link])
    ).toEqual([
      ["name", "string", undefined],
      ["price", "Price", "shop.v1.Price"],
    ]);
    // `Optional[Price]` is an optional field, not a union.
    expect(item.fields[1].optional).toBe(true);
  });

  it("says what holds each type, so it reads both ways", () => {
    const objects = objectsById();

    expect(objects.get("shop.v1.Price")!.referrers.map((r) => r.label)).toEqual(
      ["Item.price"]
    );

    // Named by two methods, and reached from neither's response.
    expect(
      objects.get("shop.v1.StockRequest")!.referrers.map((r) => r.label)
    ).toEqual(["Shop.stock (takes)", "Shop.remaining (takes)"]);

    expect(objects.get("shop.v1.Item")!.referrers.map((r) => r.label)).toEqual([
      "StockResponse.items",
    ]);
  });

  it("points a referrer at something the page can show", () => {
    const stateTypes = new Set(parse().map((stateType) => stateType.name));
    const objects = objectsById();

    for (const object of objects.values()) {
      for (const referrer of object.referrers) {
        expect(
          stateTypes.has(referrer.id) || objects.has(referrer.id),
          `${object.id} is held by ${referrer.id}, which is on neither page`
        ).toBe(true);
      }
    }
  });
});
