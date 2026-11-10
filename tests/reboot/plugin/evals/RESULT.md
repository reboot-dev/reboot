# Plugin eval results

**1 grader got worse** on this branch than on `main`:

- `deployed-api-change` / `additive-change`: passed 3 of 3 runs on `main`, 2 of 3 runs on this branch. A drop of one run can be chance.

No grader got better.

With this branch's plugin, 2 graders failed at least one run:

- `checkout-workflow` / `guarded-external-calls`: passed 0 of 3 runs
- `deployed-api-change` / `additive-change`: passed 2 of 3 runs

Each cell is the runs a grader passed, out of the runs made.

| Case                | Grader                  | Without the plugin | `main` | This branch |
| ------------------- | ----------------------- | ------------------ | ------ | ----------- |
| deployed-api-change | additive-change         | 0/3                | 3/3    | 2/3         |
| api-in-python       | fields-have-defaults    | 0/3                | 3/3    | 3/3         |
| api-in-python       | method-kinds            | 3/3                | 3/3    | 3/3         |
| checkout-workflow   | guarded-external-calls  | 0/3                | 0/3    | 0/3         |
| checkout-workflow   | workflow-is-classmethod | 0/3                | 3/3    | 3/3         |
| deployed-api-change | tag-3-still-declared    | 0/3                | 3/3    | 3/3         |
| deployed-api-change | urgency-keeps-tag-2     | 3/3                | 3/3    | 3/3         |
| private-profile     | no-self-state-id        | 3/3                | 3/3    | 3/3         |
| private-profile     | owner-only-enforced     | 3/3                | 3/3    | 3/3         |

`compare.sh` ran this at commit `6515d9f3`, against `main` at `b44e0792`, with Claude Code 2.1.331 and sonnet as the judge. It cost $22.62 at API prices.

The `Check Plugin Evals Result` job looks for this ID, which identifies the branch's change: `892e13e86ac8183ea1e92116dfa8707533b91cdf`
