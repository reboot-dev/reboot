# Don't hard-wrap prose posted to GitHub

Anything that goes into GitHub's web UI — pull request descriptions,
issue bodies, and every comment or review reply on either — gets one
long line per paragraph, with no hard line breaks. GitHub soft-wraps
it to the reader's viewport.

Commit messages are the opposite: hard-wrap their bodies at ~72
columns, because they are read in terminals through `git log`.

**Why:** A hard-wrapped paragraph renders ragged on GitHub, because
the browser wraps the already-broken lines a second time at a width
unrelated to the one they were broken at, leaving short uneven lines
that get worse on a narrow viewport. A terminal does no wrapping of
its own, so a commit message needs exactly the breaks the web UI
should never receive.

**How to apply:** When writing a PR description, an issue, or a
comment, keep each paragraph on a single line however long it runs;
tables, lists, headings and fenced code blocks still break as their
own syntax requires. Take particular care when a PR description is
drafted alongside a commit message — the two are governed by opposite
rules, and it is easy to carry the commit message's wrapping into the
PR body.
