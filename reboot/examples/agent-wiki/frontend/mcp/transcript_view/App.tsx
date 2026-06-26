import { type FC } from "react";
import {
  type UseTranscriptApi,
  useTranscript,
} from "@api/agent_wiki/v1/wiki_rbt_react";
import css from "./App.module.css";

export const TranscriptView: FC = () => {
  const { transcript, isLoading } = useTranscript();

  if (isLoading) {
    return (
      <div className={css.container}>
        <div className={css.loading}>loading...</div>
      </div>
    );
  }

  if (transcript === undefined) {
    console.error("No default Transcript id was available; cannot render.");
    return (
      <div className={css.container}>
        <div className={css.loading}>An error occurred, sorry about that!</div>
      </div>
    );
  }

  return <Transcript transcript={transcript} />;
};

const Transcript: FC<{ transcript: UseTranscriptApi }> = ({ transcript }) => {
  const { response, isLoading } = transcript.useGet();

  if (isLoading && response === undefined) {
    return (
      <div className={css.container}>
        <div className={css.loading}>loading...</div>
      </div>
    );
  }

  const messages = response?.messages ?? [];

  return (
    <div className={css.container}>
      <header className={css.header}>
        <h1 className={css.title}>Transcript</h1>
      </header>
      {messages.length === 0 ? (
        <div className={css.empty}>
          Transcript is empty. Ask the AI to add the conversation.
        </div>
      ) : (
        <ol className={css.messageList}>
          {messages.map((message, index) => (
            <li key={index} className={css.message}>
              <div className={css.role}>{message.role}</div>
              <pre className={css.content}>{message.content}</pre>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
