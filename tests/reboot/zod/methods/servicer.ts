import {
  allow,
  ReaderContext,
  TransactionContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import { Test } from "./servicer_api_rbt.js";

export class TestServicer extends Test.Servicer {
  authorizer() {
    return allow();
  }

  async construct(
    context: WriterContext,
    request: Test.ConstructRequest
  ): Promise<void> {
    this.state.data = "";
    this.state.literalValue = "option1";
  }

  async writer(
    context: WriterContext,
    request: Test.WriterRequest
  ): Promise<void> {
    assert.ok(this.state.literalValue === request.previousLiteralValue);
    this.state.data = request.data;
    if (request.newLiteralValue !== undefined) {
      this.state.literalValue = request.newLiteralValue;
    }
  }

  async checkDefaults(
    context: ReaderContext,
    request: Test.CheckDefaultsRequest
  ): Promise<void> {
    // Check that default values are correctly set after state created
    // in the constructor.
    assert.ok(this.state.stringDefaultValue === "");
    assert.ok(this.state.booleanDefaultValue === false);
    assert.ok(this.state.numberDefaultValue === 0);
    assert.ok(
      Array.isArray(this.state.arrayDefaultValue) &&
        this.state.arrayDefaultValue.length === 0
    );
    assert.ok(
      typeof this.state.recordDefaultValue === "object" &&
        this.state.recordDefaultValue !== null &&
        Object.keys(this.state.recordDefaultValue).length === 0
    );
  }

  async reader(
    context: ReaderContext,
    request: Test.ReaderRequest
  ): Promise<Test.ReaderResponse> {
    return { data: this.state.data, literalValue: this.state.literalValue };
  }

  async transaction(
    context: TransactionContext,
    request: Test.TransactionRequest
  ): Promise<void> {
    this.state.data += "(transaction)";

    await this.ref().transactionReader(context);

    const transactionWriterResponse = await this.ref().transactionWriter(
      context,
      { shouldFail: false }
    );

    // TypeScript `z.void()` maps to `undefined`.
    assert.ok(transactionWriterResponse === undefined);

    // Make sure we can see the `transactionWriter` changes.
    assert.ok(this.state.data.endsWith("(transactionWriter)"));

    try {
      this.state.data += "(transaction)";
      await this.ref().transactionWriter(context, { shouldFail: true });
    } catch (aborted) {
      assert.ok(aborted instanceof Error);
      assert.ok(
        aborted.message.endsWith("Simulated failure in transactionWriter")
      );

      // Make sure we don't see any changes from the failed writer.
      assert.ok(this.state.data.endsWith("(transaction)"));
    }
  }

  async transactionReader(
    context: ReaderContext,
    request: Test.TransactionReaderRequest
  ): Promise<void> {
    // Make sure we can see the `transaction` changes in a `reader` call.
    assert.ok(this.state.data.endsWith("(transaction)"));
  }

  async transactionWriter(
    context: WriterContext,
    request: Test.TransactionWriterRequest
  ): Promise<void> {
    // Make sure we can see the `transaction` changes in a `writer` call.
    assert.ok(this.state.data.endsWith("(transaction)"));

    // Modify the state and check that we will see the changes in
    // the outer transaction.
    this.state.data += "(transactionWriter)";

    if (request.shouldFail) {
      throw new Error("Simulated failure in transactionWriter");
    }
  }
}
