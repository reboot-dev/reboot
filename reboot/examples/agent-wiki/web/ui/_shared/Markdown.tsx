import { type FC } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import css from "./Markdown.module.css";

interface MarkdownProps {
  children: string;
}

export const Markdown: FC<MarkdownProps> = ({ children }) => (
  <article className={css.markdown}>
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
  </article>
);
