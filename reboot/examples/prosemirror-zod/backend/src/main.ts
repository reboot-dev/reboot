import { Changes } from "@monorepo/api/rbt/thirdparty/prosemirror/v1/authority";
import { Authority } from "@monorepo/api/rbt/thirdparty/prosemirror/v1/authority_rbt";
import { Checkpoint } from "@monorepo/api/rbt/thirdparty/prosemirror/v1/checkpoint_rbt";
import { DOC_ID, INITIAL_DOC, SCHEMA } from "@monorepo/common/constants";
import {
  Application,
  ReaderContext,
  WriterContext,
  allow,
  until,
} from "@reboot-dev/reboot";
import { assert, errors_pb } from "@reboot-dev/reboot-api";
import { Node } from "prosemirror-model";
import { Step } from "prosemirror-transform";

export class CheckpointServicer extends Checkpoint.Servicer {
  authorizer() {
    return allow();
  }

  async latest(
    context: ReaderContext,
    request: Checkpoint.LatestRequest
  ): Promise<Checkpoint.LatestResponse> {
    return {
      doc: this.state.doc,
      version: this.state.version,
    };
  }

  async update(
    context: WriterContext,
    request: Checkpoint.UpdateRequest
  ): Promise<void> {
    let doc = this.state.doc
      ? Node.fromJSON(SCHEMA, this.state.doc)
      : INITIAL_DOC;

    for (const { step } of request.changes) {
      doc = Step.fromJSON(SCHEMA, step).apply(doc).doc;
    }

    this.state.doc = doc.toJSON();
    this.state.version += request.changes.length;
  }
}

export class AuthorityServicer extends Authority.Servicer {
  #cache?: { version: number; doc: Node };

  authorizer() {
    return allow();
  }

  private async cache(
    context: ReaderContext | WriterContext | TransactionContext
  ) {
    // If we don't have a cached doc or we recently took a checkpoint
    // and the doc is now out of date, fetch the latest.
    if (!this.#cache || this.#cache.version < this.state.version) {
      const { doc, version } = await this.#checkpoint.latest(context);
      this.#cache = { version, doc: Node.fromJSON(SCHEMA, doc) };
    }

    // Hydrate the doc or return an already hydrated doc if there are
    // no outstanding changes in the latest `state` that need to be
    // hydrated.
    let { version, doc } = this.#cache;

    // Invariant is that `version` should never be less than
    // `this.state.version` because we should have always fetched the
    // latest above.
    assert(version >= this.state.version);

    if (version >= this.state.version) {
      // We need to apply (some) changes to the doc.
      const changes = this.state.changes.slice(version - this.state.version);

      for (const { step } of changes) {
        doc = Step.fromJSON(SCHEMA, step).apply(doc).doc;
        version++;
      }

      this.#cache = { version, doc };
    }

    return this.#cache;
  }

  async create(
    context: TransactionContext,
    request: Authority.CreateRequest
  ): Promise<Authority.CreateResponse> {
    // Call `update()` without any changes to ensure the checkpoint
    // has been created so we can safely call `latest()`.
    await this.#checkpoint.update(context);

    const { version, doc } = await this.cache(context);

    return {
      doc: doc.toJSON(),
      version,
    };
  }

  async apply(
    context: WriterContext,
    request: Authority.ApplyRequest
  ): Promise<void> {
    if (request.version != this.state.version + this.state.changes.length) {
      throw new Authority.ApplyAborted(new errors_pb.FailedPrecondition());
    }

    // Validate that we can apply these changes!
    let { version, doc } = await this.cache(context);

    // If this is the first change we're applying, also schedule
    // the `checkpoint` workflow.
    if (version == 0) {
      await this.ref().schedule().checkpoint(context);
    }

    for (const { step } of request.changes) {
      // If a step can not be `apply`ed it will throw.
      doc = Step.fromJSON(SCHEMA, step).apply(doc).doc;
    }

    // NOTE: we don't save `doc` in `this.#cache` as that is a
    // side-effect; instead `this.cache()` will correctly
    // return a hydrated doc based on the latest `state` when
    // ever we need it.

    this.state.changes = [...this.state.changes, ...request.changes];
  }

  async changes(
    context: ReaderContext,
    { sinceVersion }: Authority.ChangesRequest
  ): Promise<Authority.ChangesResponse> {
    // Invariant is that caller should have first called `create` and
    // thus will never as for a version less than `this.state.version`
    // nor should they ever ask for a version that is past the last
    // step we have recorded.
    if (
      sinceVersion < this.state.version ||
      sinceVersion > this.state.version + this.state.changes.length
    ) {
      throw new Authority.ChangesAborted(new errors_pb.InvalidArgument());
    }

    return {
      version: sinceVersion,
      changes: this.state.changes.slice(sinceVersion - this.state.version),
    };
  }

  static async checkpoint(
    context: WorkflowContext,
    request: Authority.CheckpointRequest
  ) {
    // Control loop which checkpoints after accumulating 100 changes.
    for await (const iteration of context.loop("checkpoint")) {
      const changes = await until(
        `At least 100 changes accumulated`,
        context,
        async () => {
          const { changes, version } = await Authority.ref().read(context);
          return changes.length >= 100 && changes;
        },
        { schema: Changes }
      );

      // 1. Apply the steps to the checkpoint. We need to do this
      // first so that if we get rebooted before 2. we'll just fetch
      // the latest checkpoint and apply only the relevant changes (if
      // any) from `state.changes`. Alternatively we could update
      // `state` and update the checkpoint in a transaction.
      await Checkpoint.ref().update(context, { changes });

      // 2. Truncate the changes and update the version.
      await Authority.ref().write(context, async (state) => {
        state.changes = state.changes.slice(changes.length);
        state.version += changes.length;
      });
    }
  }

  get #checkpoint() {
    // Using relative naming here, `Checkpoint` instance has same name
    // as this instance of `Authority`.
    return Checkpoint.ref(this.ref().stateId);
  }
}

const initialize = async (context) => {
  // Ensure the doc has been constructed implicitly.
  await Authority.ref(DOC_ID).create(context);
};

new Application({
  servicers: [AuthorityServicer, CheckpointServicer],
  initialize,
}).run();
