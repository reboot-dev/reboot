import {
  allow,
  ReaderContext,
  TransactionContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { Nested } from "./servicer_api_rbt.js";

// What each of the four calls writes into the one field that is its
// own, so that every value in a response or in the committed state
// names whoever put it there.
export const OUTER_WROTE = "written by the outer transaction";
export const NESTED_WROTE = "written by the nested transaction";
export const WRITER_WROTE = "written by the writer";
export const WRITER_IN_NESTED_WROTE =
  "written by the writer in the nested transaction";

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
    let nestedsWriteSeenByWriterInNested = NOT_OBSERVED;
    let writerInNestedsWriteSeenByNested = NOT_OBSERVED;
    let nestedsWriteSeenByReaderInNested = NOT_OBSERVED;
    let writerInNestedsWriteSeenByReaderInNested = NOT_OBSERVED;
    if (request.callNestedTransaction) {
      // A nested transaction on this very same state instance.
      try {
        const nested = await this.ref().nestedTransaction(context, {
          callWriterAndReader: request.nestedCallsWriterAndReader,
          abort: request.nestedAborts,
        });
        ({
          outersWriteSeenByNested,
          nestedsWriteSeenByWriterInNested,
          writerInNestedsWriteSeenByNested,
          nestedsWriteSeenByReaderInNested,
          writerInNestedsWriteSeenByReaderInNested,
        } = nested);
      } catch (aborted) {
        // We carry on without what the nested transaction would have
        // told us, and commit without its writes.
        if (!(aborted instanceof Nested.NestedTransactionAborted)) {
          throw aborted;
        }
      }
    }

    const nestedsWriteSeenByOuter = this.state.writtenByNested;
    const writerInNestedsWriteSeenByOuter = this.state.writtenByWriterInNested;

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
      nestedsWriteSeenByWriterInNested,
      writerInNestedsWriteSeenByNested,
      nestedsWriteSeenByReaderInNested,
      writerInNestedsWriteSeenByReaderInNested,
      writerInNestedsWriteSeenByOuter,
    };
  }

  async nestedTransaction(
    context: TransactionContext,
    request: Nested.NestedTransactionRequest
  ): Promise<Nested.NestedTransactionResponse> {
    const outersWriteSeenByNested = this.state.writtenByOuter;
    // Write our own field before calling anybody, so that the writer
    // and the reader have a write of ours to observe.
    this.state.writtenByNested = NESTED_WROTE;

    let nestedsWriteSeenByWriterInNested = NOT_OBSERVED;
    let writerInNestedsWriteSeenByNested = NOT_OBSERVED;
    let nestedsWriteSeenByReaderInNested = NOT_OBSERVED;
    let writerInNestedsWriteSeenByReaderInNested = NOT_OBSERVED;
    if (request.callWriterAndReader) {
      // A writer and then a reader on this very same state instance,
      // called while we have a write of our own that has not reached
      // our caller yet.
      const writer = await this.ref().writerInNested(context, {});
      nestedsWriteSeenByWriterInNested =
        writer.nestedsWriteSeenByWriterInNested;
      writerInNestedsWriteSeenByNested = this.state.writtenByWriterInNested;

      const reader = await this.ref().get(context, {});
      nestedsWriteSeenByReaderInNested = reader.writtenByNested;
      writerInNestedsWriteSeenByReaderInNested = reader.writtenByWriterInNested;
    }

    if (request.abort) {
      // Abort only now that we and the writer we called have both
      // written, so that there are writes to drop.
      throw new Nested.NestedTransactionAborted({
        type: "RequestedAbortError",
      });
    }

    return {
      outersWriteSeenByNested,
      nestedsWriteSeenByWriterInNested,
      writerInNestedsWriteSeenByNested,
      nestedsWriteSeenByReaderInNested,
      writerInNestedsWriteSeenByReaderInNested,
    };
  }

  async writer(
    context: WriterContext,
    request: Nested.WriterRequest
  ): Promise<void> {
    this.state.writtenByWriter = WRITER_WROTE;
  }

  async writerInNested(
    context: WriterContext,
    request: Nested.WriterInNestedRequest
  ): Promise<Nested.WriterInNestedResponse> {
    const nestedsWriteSeenByWriterInNested = this.state.writtenByNested;
    this.state.writtenByWriterInNested = WRITER_IN_NESTED_WROTE;
    return { nestedsWriteSeenByWriterInNested };
  }

  async get(
    context: ReaderContext,
    request: Nested.GetRequest
  ): Promise<Nested.GetResponse> {
    return {
      writtenByOuter: this.state.writtenByOuter,
      writtenByNested: this.state.writtenByNested,
      writtenByWriter: this.state.writtenByWriter,
      writtenByWriterInNested: this.state.writtenByWriterInNested,
    };
  }
}
