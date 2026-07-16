import { strict as assert } from "node:assert";
import test from "node:test";
import { Account } from "./errors_zod.js";

// Validates the Zod API definition snippet used in
// `documentation/docs/learn_more/errors.mdx`.
test("Tests for the errors documentation Zod snippet", () => {
  const { withdraw } = Account.methods;
  assert.equal(withdraw.kind, "writer");

  assert.equal(withdraw.errors.length, 1);
  const error = withdraw.errors[0].parse({
    type: "OverdraftError",
    amount: 3.5,
  });
  assert.equal(error.type, "OverdraftError");
  assert.equal(error.amount, 3.5);

  assert.throws(() =>
    withdraw.errors[0].parse({ type: "SomeOtherError", amount: 3.5 })
  );
});
