# Plugin eval results

No grader got worse on this branch than on `main`.

No grader got better.

With this branch's plugin, 1 grader failed at least one run:

- `checkout-workflow` / `guarded-external-calls`: passed 1 of 3 runs

Each cell is the runs a grader passed, out of the runs made.

| Case                | Grader                  | Without the plugin | `main` | This branch |
| ------------------- | ----------------------- | ------------------ | ------ | ----------- |
| api-in-python       | fields-have-defaults    | 0/3                | 3/3    | 3/3         |
| api-in-python       | method-kinds            | 3/3                | 3/3    | 3/3         |
| checkout-workflow   | guarded-external-calls  | 0/3                | 1/3    | 1/3         |
| checkout-workflow   | workflow-is-classmethod | 0/3                | 3/3    | 3/3         |
| deployed-api-change | additive-change         | 0/3                | 3/3    | 3/3         |
| deployed-api-change | tag-3-still-declared    | 0/3                | 3/3    | 3/3         |
| deployed-api-change | urgency-keeps-tag-2     | 3/3                | 3/3    | 3/3         |
| private-profile     | no-self-state-id        | 3/3                | 3/3    | 3/3         |
| private-profile     | owner-only-enforced     | 3/3                | 3/3    | 3/3         |

`compare.sh` ran this at commit `2000a236a`, against `main` at `2f3399d8a`, with Claude Code 2.1.325 and sonnet as the judge. It cost $22.78 at API prices.

The `Check Plugin Evals Result` job looks for this ID, which identifies the branch's change: `2a8e1dcd7a04ec1dfc9038135a0ea40c0c86bda2`
