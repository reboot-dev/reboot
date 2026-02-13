import { Query, useThread } from "@/api/docubot/thread/v1/thread_rbt_react.js";
import { StateNotConstructed } from "@reboot-dev/reboot-api/errors_pb";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { FC, useEffect } from "react";
import * as uuid from "uuid";
import ChatMessage from "./ChatMessage.js";
import DocubotWindow from "./DocubotWindow.js";
import MessagesWindow from "./MessagesWindow.js";
import QuestionBox from "./QuestionBox.js";

import "./index.css";

interface Queries {
  queries: Query[];
  threadId: string;
}

const Queries: FC<Queries> = ({ queries }) => {
  return (
    <MessagesWindow>
      {queries
        .slice()
        .reverse()
        .map((query: Query, index: number) => {
          return (
            <div key={index}>
              <ChatMessage
                message={query.content}
                name="You"
                isOwnMessage={true}
              />
              <ChatMessage
                message={query.response != "" ? query.response : "..."}
                name="docubot"
                isOwnMessage={false}
              />
            </div>
          );
        })}
    </MessagesWindow>
  );
};

const LOCAL_STORAGE_DOCUBOT_THREAD_ID = "docubot-thread-id";

const _Docubot = ({ assistantId }: { assistantId: string }) => {
  let threadId = localStorage.getItem(LOCAL_STORAGE_DOCUBOT_THREAD_ID);

  if (threadId === null) {
    threadId = uuid.v4();
    localStorage.setItem(LOCAL_STORAGE_DOCUBOT_THREAD_ID, threadId);
  }

  const thread = useThread({ id: threadId });

  const { response, aborted } = thread.useMessages();

  useEffect(() => {
    if (aborted !== undefined) {
      if (aborted.error instanceof StateNotConstructed) {
        thread.create({ assistantId });
      }
    }
  }, [aborted]);

  const onAskQuestion = (question: string) => {
    thread.query({ content: question });
  };

  if (response === undefined) return <>Loading...</>;
  return (
    <DocubotWindow>
      <Queries threadId={threadId} queries={response.queries} />
      <QuestionBox onSubmit={onAskQuestion} />
    </DocubotWindow>
  );
};

function Docubot({
  assistantId,
  clientApiEndpoint,
  withInternalRebootClientContext = true,
}: {
  assistantId: string;
  clientApiEndpoint: string;
  withInternalRebootClientContext?: boolean;
}) {
  if (withInternalRebootClientContext) {
    return (
      <RebootClientProvider url={clientApiEndpoint}>
        <_Docubot assistantId={assistantId} />
      </RebootClientProvider>
    );
  }

  return <_Docubot assistantId={assistantId} />;
}

export default Docubot;
