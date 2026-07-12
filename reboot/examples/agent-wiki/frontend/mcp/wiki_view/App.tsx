import { type FC } from "react";
import { type UseWikiApi, useWiki } from "@api/agent_wiki/v1/wiki_rbt_react";
import { Markdown } from "../_shared/Markdown";
import css from "./App.module.css";

export const WikiView: FC = () => {
  const { wiki, isLoading } = useWiki();

  if (isLoading) {
    return (
      <div className={css.container}>
        <div className={css.loading}>loading...</div>
      </div>
    );
  }

  if (wiki === undefined) {
    console.error("No default Wiki id was available; cannot render.");
    return (
      <div className={css.container}>
        <div className={css.loading}>An error occurred, sorry about that!</div>
      </div>
    );
  }

  return <Wiki wiki={wiki} />;
};

const Wiki: FC<{ wiki: UseWikiApi }> = ({ wiki }) => {
  const { response, isLoading } = wiki.useGet();

  if (isLoading && response === undefined) {
    return (
      <div className={css.container}>
        <div className={css.loading}>loading...</div>
      </div>
    );
  }

  const content = response?.content ?? "";

  return (
    <div className={css.container}>
      <header className={css.header}>
        <h1 className={css.title}>{response?.name || "Unnamed Wiki"}</h1>
        {response?.description && (
          <p className={css.description}>{response.description}</p>
        )}
      </header>
      {content ? (
        <Markdown>{content}</Markdown>
      ) : (
        <div className={css.empty}>This wiki has no content yet.</div>
      )}
    </div>
  );
};
