// The markdown an agent's system prompt and instructions are written
// in, parsed into blocks the page renders itself: headings,
// paragraphs, lists, fenced code, and within them code spans,
// emphasis and links. Nothing is ever handed to the page as HTML, so
// a prompt cannot put markup, or a script, on the page.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "emphasis"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "heading"; level: number; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "code"; text: string };

// A code span, strong or emphasized text between `**`/`__` or
// `*`/`_`, or a link. An underscore only emphasizes outside a word,
// so `get_page` stays one word.
const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|(?<!\w)__(.+?)__(?!\w)|\*([^*\s](?:[^*]*[^*\s])?)\*|(?<!\w)_([^_\s](?:[^_]*[^_\s])?)_(?!\w)|\[([^\]]+)\]\(([^)\s]+)\)/g;

// Only links that go somewhere ordinary are links; any other scheme,
// `javascript:` included, is left as the text it was written as.
const isSafeHref = (href: string): boolean => /^(https?:|mailto:)/i.test(href);

export const parseInline = (text: string): Inline[] => {
  const inlines: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index!;
    const [
      whole,
      code,
      starStrong,
      underscoreStrong,
      starEmphasis,
      underscoreEmphasis,
      linkText,
      href,
    ] = match;
    if (linkText !== undefined && !isSafeHref(href)) {
      continue;
    }
    if (index > last) {
      inlines.push({ kind: "text", text: text.slice(last, index) });
    }
    if (code !== undefined) {
      inlines.push({ kind: "code", text: code });
    } else if (starStrong !== undefined || underscoreStrong !== undefined) {
      inlines.push({
        kind: "strong",
        children: parseInline(starStrong ?? underscoreStrong),
      });
    } else if (starEmphasis !== undefined || underscoreEmphasis !== undefined) {
      inlines.push({
        kind: "emphasis",
        children: parseInline(starEmphasis ?? underscoreEmphasis),
      });
    } else {
      inlines.push({ kind: "link", href, children: parseInline(linkText) });
    }
    last = index + whole.length;
  }
  if (last < text.length) {
    inlines.push({ kind: "text", text: text.slice(last) });
  }
  return inlines;
};

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s*```/;

export const parseMarkdown = (text: string): Block[] => {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    if (FENCE.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      // Past the closing fence, or the end of an unclosed one.
      index += 1;
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        content: parseInline(heading[2]),
      });
      index += 1;
      continue;
    }
    const firstItem = LIST_ITEM.exec(line);
    if (firstItem !== null) {
      const ordered = /\d/.test(firstItem[1]);
      const items: string[] = [];
      while (index < lines.length && lines[index].trim() !== "") {
        const item = LIST_ITEM.exec(lines[index]);
        if (item !== null) {
          items.push(item[2]);
        } else if (FENCE.test(lines[index]) || HEADING.test(lines[index])) {
          break;
        } else {
          // A line that is no item carries on the item before it.
          items[items.length - 1] += ` ${lines[index].trim()}`;
        }
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items: items.map(parseInline) });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !FENCE.test(lines[index]) &&
      !HEADING.test(lines[index]) &&
      !LIST_ITEM.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({
      kind: "paragraph",
      content: parseInline(paragraph.join(" ")),
    });
  }
  return blocks;
};
