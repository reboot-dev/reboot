"use client";

import { JsonValue, Struct } from "@bufbuild/protobuf";
import { useAuthority } from "@monorepo/api/rbt/thirdparty/prosemirror/v1/authority_rbt_react";
import {
  ProseMirror,
  ProseMirrorProps,
  useEditorEffect,
  useEditorState,
} from "@nytimes/react-prosemirror";
import {
  collab,
  getVersion,
  receiveTransaction,
  sendableSteps,
} from "prosemirror-collab";
import { Node, Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { Step } from "prosemirror-transform";
import { ReactNode, useEffect, useMemo, useState } from "react";

function RebootProseMirrorAdaptor({
  id,
  schema,
  version,
  children,
}: {
  id: string;
  schema: Schema;
  version?: number;
  children: ReactNode;
}) {
  // NOTE: while we could also pass `authority` in as a prop the
  // Reboot React library and generated code will ensure there is only
  // one instance of `authority` so it's not actually necessary.
  const authority = useAuthority({ id });

  // In order to send steps to the server (authority) we reactively
  // watch for updates to the state to see if we have anything
  // sendable and if we're not currently sending we send.
  const state = useEditorState();

  // Track if we're currently sending.
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!sending) {
      let sendable = sendableSteps(state);
      if (sendable) {
        setSending(true);
        authority
          .apply({
            version: sendable.version,
            changes: sendable.steps.map((step) => ({
              step: Struct.fromJson(step.toJSON()),
              client: `${sendable.clientID}`,
            })),
          })
          .finally(() => {
            setSending(false);
          });
      }
    }
  }, [state, sending]);

  // In order to receive steps from the server (authority) we reactively
  // listen for changes via `authority.useChanges(...)` and then pass
  // those steps on to the view as a transaction.
  const [sinceVersion, setSinceVersion] = useState(version);

  const { response } = authority.useChanges({ sinceVersion });

  useEditorEffect(
    (view) => {
      if (response !== undefined) {
        const { version, changes } = response;

        // Get out only the steps that we haven't applied locally.
        //
        // We need to do this because `authority.useChanges(...)` might get
        // another response before we've called `setSinceVersion(...)`
        // and thus we might get steps we've already applied which
        // ProseMirror can't seem to handle.
        const unappliedChanges = changes.slice(
          getVersion(view.state) - version
        );

        if (unappliedChanges.length > 0) {
          // TODO: calling `view.dispatch()` here seems to cause
          // 'Warning: flushSync was called from inside a lifecycle method';
          // what is the correct way to do this within the
          // 'react-prosemirror' library?
          Promise.resolve().then(() => {
            view.dispatch(
              receiveTransaction(
                view.state,
                unappliedChanges.map(({ step }) =>
                  Step.fromJSON(schema, step?.toJson())
                ),
                unappliedChanges.map(({ client }) => Number(client))
              )
            );
            setSinceVersion(getVersion(view.state));
          });
        }
      }
    },
    [response]
  );

  return <>{children}</>;
}

interface RebootProseMirrorProps extends ProseMirrorProps {
  id: string;
  schema: Schema;
  version: number;
  doc: JsonValue;

  // Ensure that these aren't set.
  state?: undefined;
  defaultState?: undefined;
}

let haveLoggedAboutIncorrectUsage = false;

export default function RebootProseMirror({
  id,
  schema,
  version,
  doc,
  children,
  ...props
}: RebootProseMirrorProps) {
  // Log about incorrect usage (if we haven't done so already).
  if (
    (props.state !== undefined || props.defaultState !== undefined) &&
    !haveLoggedAboutIncorrectUsage
  ) {
    console.error(
      "Not expecting properties `state` or `defaultState` to be passed to " +
        "`RebootProseMirror` as it is responsible for fetching your state " +
        "via `id` instead"
    );
    haveLoggedAboutIncorrectUsage = true;
  }

  delete props.state;
  delete props.defaultState;

  props.defaultState = EditorState.create({
    schema,
    doc: Node.fromJSON(schema, doc),
    plugins: [collab({ version })],
  });

  return (
    <>
      <ProseMirror {...props}>
        <RebootProseMirrorAdaptor id={id} schema={schema} version={version}>
          {children}
        </RebootProseMirrorAdaptor>
      </ProseMirror>
    </>
  );
}
