// An agent's system prompt and instructions are markdown, which the
// types pane renders from these blocks.
import { describe, expect, it } from "vitest";
import {
  parseInline,
  parseMarkdown,
} from "../../../reboot/dashboard/web/src/markdown";

describe("parseMarkdown", () => {
  it("separates paragraphs, joining a paragraph's lines", () => {
    expect(parseMarkdown("You are a librarian.\nBe brief.\n\nFold.")).toEqual([
      {
        kind: "paragraph",
        content: [{ kind: "text", text: "You are a librarian. Be brief." }],
      },
      { kind: "paragraph", content: [{ kind: "text", text: "Fold." }] },
    ]);
  });

  it("reads a list right after the paragraph introducing it", () => {
    expect(
      parseMarkdown("Your workflow:\n1. Read.\n2. Write\n   it down.")
    ).toEqual([
      {
        kind: "paragraph",
        content: [{ kind: "text", text: "Your workflow:" }],
      },
      {
        kind: "list",
        ordered: true,
        items: [
          [{ kind: "text", text: "Read." }],
          [{ kind: "text", text: "Write it down." }],
        ],
      },
    ]);
  });

  it("reads headings and fenced code, keeping the code as written", () => {
    expect(parseMarkdown("## Habits\n```\n- not a list\n```")).toEqual([
      {
        kind: "heading",
        level: 2,
        content: [{ kind: "text", text: "Habits" }],
      },
      { kind: "code", text: "- not a list" },
    ]);
  });
});

describe("parseInline", () => {
  it("reads code spans, strong and emphasized text", () => {
    expect(parseInline("Call `get_wiki` **first**, *then* _write_.")).toEqual([
      { kind: "text", text: "Call " },
      { kind: "code", text: "get_wiki" },
      { kind: "text", text: " " },
      { kind: "strong", children: [{ kind: "text", text: "first" }] },
      { kind: "text", text: ", " },
      { kind: "emphasis", children: [{ kind: "text", text: "then" }] },
      { kind: "text", text: " " },
      { kind: "emphasis", children: [{ kind: "text", text: "write" }] },
      { kind: "text", text: "." },
    ]);
  });

  it("leaves underscores inside a word alone", () => {
    expect(parseInline("call get_page or update_page")).toEqual([
      { kind: "text", text: "call get_page or update_page" },
    ]);
  });

  it("links only to ordinary schemes", () => {
    expect(
      parseInline("[docs](https://reboot.dev) [x](javascript:alert(1))")
    ).toEqual([
      {
        kind: "link",
        href: "https://reboot.dev",
        children: [{ kind: "text", text: "docs" }],
      },
      { kind: "text", text: " [x](javascript:alert(1))" },
    ]);
  });
});
