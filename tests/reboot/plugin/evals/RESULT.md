# Plugin eval results

No grader got worse on this branch than on `main`.

1 grader got better:

- `api-in-python` / `method-kinds`: passed 2 of 3 runs on `main`, 3 of 3 runs on this branch

With this branch's plugin, 1 grader failed at least one run:

- `checkout-workflow` / `guarded-external-calls`: passed 0 of 3 runs

Each cell is the runs a grader passed, out of the runs made.

| Case                | Grader                  | Without the plugin | `main` | This branch |
| ------------------- | ----------------------- | ------------------ | ------ | ----------- |
| api-in-python       | fields-have-defaults    | 0/3                | 3/3    | 3/3         |
| api-in-python       | method-kinds            | 2/3                | 2/3    | 3/3         |
| checkout-workflow   | guarded-external-calls  | 0/3                | 0/3    | 0/3         |
| checkout-workflow   | workflow-is-classmethod | 1/3                | 3/3    | 3/3         |
| deployed-api-change | additive-change         | 0/3                | 3/3    | 3/3         |
| deployed-api-change | tag-3-still-declared    | 0/3                | 3/3    | 3/3         |
| deployed-api-change | urgency-keeps-tag-2     | 3/3                | 3/3    | 3/3         |
| private-profile     | no-self-state-id        | 3/3                | 3/3    | 3/3         |
| private-profile     | owner-only-enforced     | 3/3                | 3/3    | 3/3         |

`compare.sh` ran this at commit `423f6d0a`, against `main` at `f6e0b4d1`, with Claude Code 2.1.331 and sonnet as the judge. It cost $23.07 at API prices.

The `Check Plugin Evals Result` job looks for this ID, which identifies the branch's change: `8428dff0d03c07d0635eaabdc943088788ec6d4b`
