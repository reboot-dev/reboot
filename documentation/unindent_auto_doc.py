import argparse
import glob
import os
import textwrap

START_MARKER = "<!-- MARKDOWN-AUTO-DOCS:START"
END_MARKER = "<!-- MARKDOWN-AUTO-DOCS:END -->"
CODE_FENCE = "```"


def unindent_code_snippet(snippet):
    """Un-indents a code snippet."""
    return textwrap.dedent(snippet)


def unindent_markdown_section(content):
    """Un-indents only the code snippets between the markers."""
    lines = content.splitlines(keepends=True)
    new_lines = []
    inside_block = False
    inside_code_block = False
    pending_blank_line_after_code_fence = False
    code_block_content: list[str] = []

    modified = False

    for line in lines:
        if pending_blank_line_after_code_fence:
            if line.strip():
                new_lines.append("\n")
            pending_blank_line_after_code_fence = False

        if START_MARKER in line:
            modified = True
            inside_block = True
            new_lines.append(line)
        elif END_MARKER in line:
            inside_block = False
            inside_code_block = False
            new_lines.append(line)
        elif (
            inside_block and not inside_code_block and
            line.lstrip().startswith(CODE_FENCE)
        ):
            # Keep a blank line before fenced code blocks in MDX.
            # Without this, Prettier can mangle fenced blocks inside JSX tags.
            if new_lines and new_lines[-1].strip():
                new_lines.append("\n")
            inside_code_block = True
            new_lines.append(line)
        elif inside_code_block and line.lstrip().startswith(CODE_FENCE):
            if code_block_content:
                unindented_code = unindent_code_snippet(
                    "".join(code_block_content)
                )
                new_lines.append(unindented_code)
                code_block_content = []
            inside_code_block = False
            new_lines.append(line)
            pending_blank_line_after_code_fence = True
        elif inside_code_block:
            code_block_content.append(line)
        else:
            new_lines.append(line)

    return (modified, "".join(new_lines))


def process_file(file_path):
    """Read, un-indent, and rewrite the file if needed."""
    with open(file_path, "r") as file:
        content = file.read()

    modified, updated_content = unindent_markdown_section(content)

    if modified:
        # Write the updated content back to the file
        with open(file_path, "w") as file:
            file.write(updated_content)
        print(f"Updated file: {file_path}")


if __name__ == "__main__":
    print("Un-indenting code snippets in Markdown files.")

    parser = argparse.ArgumentParser(
        description="Un-indent code snippets in Markdown files."
    )
    parser.add_argument(
        'files',
        type=str,
        nargs='+',
        help="files or glob patterns to un-indent code snippets in.",
    )

    args = parser.parse_args()

    for pattern in args.files:
        if os.path.isfile(pattern):
            process_file(pattern)
        else:
            for file_path in glob.glob(pattern, recursive=True):
                process_file(file_path)
