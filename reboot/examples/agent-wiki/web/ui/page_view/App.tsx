import { type FC } from "react";
import { usePage } from "@api/agent_wiki/v1/wiki_rbt_react";
import { Markdown } from "../_shared/Markdown";
import css from "./App.module.css";

export const PageView: FC = () => {
  const page = usePage();
  const { response, isLoading } = page.useGet();

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
        <h1 className={css.title}>{response?.title || "Untitled Page"}</h1>
      </header>
      {content ? (
        <Markdown>{content}</Markdown>
      ) : (
        <div className={css.empty}>This page has no content yet.</div>
      )}
    </div>
  );
};
