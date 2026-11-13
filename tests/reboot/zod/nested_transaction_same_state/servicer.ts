import {
  allow,
  ReaderContext,
  TransactionContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { Nested } from "./servicer_api_rbt.js";

// What each of the three calls writes into the one field that is its
// own, so that every value in a response or in the committed state
// names whoever put it there.
export const OUTER_WROTE = "written by the outer transaction";
export const NESTED_WROTE = "written by the nested transaction";
export const WRITER_WROTE = "written by the writer";

// The default every field starts at. A field that still holds this
// once the transaction has committed lost the write meant for it.
export const NOT_WRITTEN = "";

// Read in place of a value by a call that was told to skip the step
// that would have produced it, so that a skipped step can not be
// mistaken for a lost write.
export const NOT_OBSERVED = "<step skipped>";

export class NestedServicer extends Nested.Servicer {
  authorizer() {
    return allow();
  }

  async outerTransaction(
    context: TransactionContext,
    request: Nested.OuterTransactionRequest
  ): Promise<Nested.OuterTransactionResponse> {
    // Write our own field before calling anybody, so that the nested
    // transaction has a write of ours to observe.
    this.state.writtenByOuter = OUTER_WROTE;

    let outersWriteSeenByNested = NOT_OBSERVED;
    if (request.callNestedTransaction) {
      // A nested transaction on this very same state instance.
      const nested = await this.ref().nestedTransaction(context, {});
      outersWriteSeenByNested = nested.outersWriteSeenByNested;
    }

    const nestedsWriteSeenByOuter = this.state.writtenByNested;

    let writersWriteSeenByOuter = NOT_OBSERVED;
    if (request.callWriter) {
      await this.ref().writer(context, {});
      writersWriteSeenByOuter = this.state.writtenByWriter;
    }

    return {
      outersWriteSeenByNested,
      nestedsWriteSeenByOuter,
      writersWriteSeenByOuter,
      outersWriteSeenByOuter: this.state.writtenByOuter,
    };
  }

  async nestedTransaction(
    context: TransactionContext,
    request: Nested.NestedTransactionRequest
  ): Promise<Nested.NestedTransactionResponse> {
    const outersWriteSeenByNested = this.state.writtenByOuter;
    this.state.writtenByNested = NESTED_WROTE;
    return { outersWriteSeenByNested };
  }

  async writer(
    context: WriterContext,
    request: Nested.WriterRequest
  ): Promise<void> {
    this.state.writtenByWriter = WRITER_WROTE;
  }

  async get(
    context: ReaderContext,
    request: Nested.GetRequest
  ): Promise<Nested.GetResponse> {
    return {
      writtenByOuter: this.state.writtenByOuter,
      writtenByNested: this.state.writtenByNested,
      writtenByWriter: this.state.writtenByWriter,
    };
  }
}
