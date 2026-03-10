import { UnknownError, ensureError } from "@reboot-dev/reboot";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

describe("Utils", () => {
  describe("UnknownError", () => {
    it("should have correct error name", () => {
      const error = new UnknownError();

      assert.equal(error.name, "UnknownError");
    });

    it("should have correct instance", () => {
      const error = new UnknownError();

      assert.ok(error instanceof UnknownError);
    });

    it("should have correct error message if message is undefined", () => {
      const error = new UnknownError();

      assert.equal(error.message, "undefined");
    });

    it("should have correct error message if message is string", () => {
      const error = new UnknownError("Test error");

      assert.equal(error.message, "Test error");
    });

    it("should have mangled error message if message is object", () => {
      const error = new UnknownError({ a: 1 });

      assert.equal(error.message, "[object Object]");
    });

    it("should have correct error string if message is undefined", () => {
      const error = new UnknownError();

      assert.equal(String(error), "UnknownError: undefined");
    });

    it("should have correct error string", () => {
      const error = new UnknownError("Test error");

      assert.equal(String(error), "UnknownError: Test error");
    });

    it("should have stack trace", () => {
      const error = new UnknownError("Test error");

      assert.ok(error.stack);
    });
  });

  describe("ensureError", () => {
    it("should create an UnknownError from a string", () => {
      const error = ensureError("error test string");

      assert.ok(error instanceof UnknownError);
    });

    it("should forward an existing Error", () => {
      const error = ensureError(new Error("standard error"));

      assert.ok(!(error instanceof UnknownError));
      assert.ok(error instanceof Error);
    });
  });
});
