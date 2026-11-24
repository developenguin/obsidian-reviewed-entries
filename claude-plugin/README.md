# Operator (Claude plugin)

Logs evidence of your work against your own goals, in an Obsidian vault shown with the [Reviewed Entries](../README.md) Obsidian plugin. Goals can be anything you want evidence for: development goals, OKRs, role accountabilities, or Luscii's Matrix Reloaded compensation statements, which it can import directly. Evidence only: no grading.

Each goal can split into **facets**: parts of the same goal that each need their own evidence. A goal counts as covered when every facet has confirmed evidence.

## Requirements

- Claude Code (the desktop app for scheduled reviews)
- Obsidian with the Reviewed Entries plugin
- Node 18 or newer

## Scripts

`scripts/` holds the bundled command-line tools the skills call. They are generated from [`cli/`](../cli) with `yarn build:cli`; don't edit them.

| Script | Does |
|---|---|
| `tracker.mjs` | Set up the tracker folder, list goals and coverage, add and review entries, explain goals, settings, review window and health |
| `import-matrix.mjs` | Optional: import Luscii's Matrix Reloaded sheet (`.ods`) as goals, with its notes and rating guidelines |

The tracker finds your vault through `~/.operator.json`, written by `tracker.mjs init`, or the `OPERATOR_VAULT` and `OPERATOR_FOLDER` environment variables.
