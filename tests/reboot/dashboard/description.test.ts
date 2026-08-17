// The reader and the page agree on a shape.
//
// `api_reader.py` writes the description and `description.ts` reads
// it, and since it travels as JSON there is no generated type holding
// the two together. This is what does instead: the build runs the
// real reader over `api/`, and parsing what it wrote fails if either
// side has drifted from the other.
import { describe, expect, it } from "vitest";
import {
  DescriptionSchema,
  fieldsOf,
} from "../../../reboot/dashboard/frontend/src/description";
import described from "./described";

describe("the description the reader writes", () => {
  it("is what this page expects", () => {
    expect(() => DescriptionSchema.parse(described)).not.toThrow();
  });

  it("carries nested types rather than naming them", () => {
    const [shop] = DescriptionSchema.parse(described);

    const remaining = shop.methods.find(
      (method) => method.name === "remaining"
    );
    expect(remaining?.response).toBeDefined();

    const fields = fieldsOf(shop, remaining!.response!);
    const items = fields.find((field) => field.name === "items");

    // `items` is a list of `Item`, and `Item` opens: its `price` is
    // an `Optional[Price]`, and `Price` opens in turn. This is the
    // whole point of the change.
    expect(items?.type).toBe("Item[]");

    const price = items?.children.find((field) => field.name === "price");
    expect(price?.optional).toBe(true);
    expect(price?.children.map((field) => field.name)).toEqual([
      "currency",
      "cents",
    ]);
  });

  it("makes an error's fields readable, not just its name", () => {
    const [shop] = DescriptionSchema.parse(described);

    const remaining = shop.methods.find(
      (method) => method.name === "remaining"
    );
    const [error] = remaining!.errors;

    expect(error.$ref).toBe("#/$defs/OutOfStockError");
    expect(fieldsOf(shop, error).map((field) => field.name)).toEqual(["item"]);
  });
});
