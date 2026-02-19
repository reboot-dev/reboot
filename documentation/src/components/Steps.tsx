import { Fragment, createElement, ReactNode, useEffect, useState } from "react";
import * as jsx from "react/jsx-runtime";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkAdmonitions from "@docusaurus/mdx-loader/lib/remark/admonitions";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import rehypeReact from "rehype-react";
import Admonition from "@theme/Admonition";

export function CodeStepByStep({
  children,
  description,
}: {
  children: ReactNode;
  description: string;
}) {
  return (
    <div className="lg:w-[calc(100vw_-_382px)] lg:max-w-[1320px]">
      <div className="my-8 text-lg">{description}</div>
      <ol>{children}</ol>
    </div>
  );
}

export function Step({
  children,
  description,
  title,
}: {
  title: ReactNode;
  description: string;
  children: ReactNode;
}) {
  const [descriptionJsx, setDescriptionJsx] = useState(createElement(Fragment));

  useEffect(() => {
    // After much toil we failed to get "react-markdown" or
    // "react-remark" to work. "react-markdown" did not work because
    // it does not support async remark plugins (see
    // https://github.com/remarkjs/react-markdown/pull/682) and we
    // need the "remark-admonitions" plugin which is async.
    // "react-remark" failed when we tried to pass it markdown with
    // newlines, which clearly we need.
    //
    // So we directly used `unified` to do the processing.
    //
    // Note that we also could not use "remark-admonitions" plugin
    // because it is known to be broken without a fix, so instead
    // we use "@docusaurus/mdx-loader/lib/remark/admonitions" which
    // is a fork of "remark-admonitions". The nice thing about that
    // is that it means we get the same rendering in our
    // `StepDescription` as we do elsewhere.
    (async function () {
      // `unified().process()` returns a `VFile` which is their
      // internal format. We want to extract the `result` property.
      const file = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkDirective)
        .use(remarkAdmonitions)
        .use(remarkRehype)
        .use(rehypeReact, {
          Fragment: jsx.Fragment,
          jsx: jsx.jsx,
          jsxs: jsx.jsxs,
          components: {
            admonition: Admonition,
          },
        })
        .process(description);
      setDescriptionJsx(file.result);
    })();
  }, [description]);

  return (
    <li>
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="w-full m-4 sm:m-0">
          <div className="font-bold">{title}</div>
          <div className="mr-2">{descriptionJsx}</div>
        </div>
        <div className="m-4 pr-4 sm:m-0">{children}</div>
      </div>
    </li>
  );
}
