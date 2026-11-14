# Plugin eval results

This branch does not change the plugin, so there is no comparison with `main`. The table shows how the cases did with the plugin and without it.

With this branch's plugin, every grader passed every run.

Each cell is the runs a grader passed, out of the runs made.

| Case                | Grader                  | Without the plugin | With the plugin |
| ------------------- | ----------------------- | ------------------ | --------------- |
| api-in-python       | fields-have-defaults    | 0/3                | 3/3             |
| api-in-python       | method-kinds            | 3/3                | 3/3             |
| checkout-workflow   | guarded-external-calls  | 3/3                | 3/3             |
| checkout-workflow   | workflow-is-classmethod | 0/3                | 3/3             |
| deployed-api-change | additive-change         | 0/3                | 3/3             |
| deployed-api-change | tag-3-still-declared    | 0/3                | 3/3             |
| deployed-api-change | urgency-keeps-tag-2     | 3/3                | 3/3             |
| private-profile     | no-self-state-id        | 3/3                | 3/3             |
| private-profile     | owner-only-enforced     | 3/3                | 3/3             |

`compare.sh` ran this at commit `8dc7b8f3`, with Claude Code 2.1.319 and sonnet as the judge. It cost $12.50 at API prices.

The `Check Plugin Evals Result` job looks for this ID, which identifies the branch's change: `60110f2ce1eedc0d758b56bf3050b3c82fc1b280`
