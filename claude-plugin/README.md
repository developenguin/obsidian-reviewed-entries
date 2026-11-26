# Operator (Claude plugin)

Logs evidence of your work against your own goals, in an Obsidian vault shown with the [Reviewed Entries](../README.md) Obsidian plugin. Goals can be anything you want evidence for: development goals, OKRs, role accountabilities, or Luscii's Matrix Reloaded compensation statements, which it can import directly. Evidence only: no grading.

Each goal can split into **facets**: parts of the same goal that each need their own evidence. A goal counts as covered when every facet has confirmed evidence.

You work with it by talking to Claude (`/operator:setup` to start) and, if you use Obsidian, by looking at the overview there. You never run commands or build anything.

## Requirements

- Claude Code in the desktop app (scheduled reviews, and reading your Claude Code sessions as a source)
- Node 18 or newer, which Claude uses to run the plugin's scripts
- Optional: Obsidian with the Reviewed Entries plugin, for the overview and inbox. Without it, the tracker is a folder of Markdown files that Claude reads and writes.

## For maintainers

`scripts/` holds the bundled scripts the skills call; Claude runs them, users don't. They are built from `src/` (which shares `src/model.ts` of the Obsidian plugin at the repository root) with `yarn build:plugin`. Commit the bundle together with the source.

| Script | Does |
|---|---|
| `tracker.mjs` | Set up the tracker folder, list goals and coverage, add and review entries, explain goals, settings, review window and health |
| `import-matrix.mjs` | Optional: import Luscii's Matrix Reloaded sheet (`.ods`) as goals, with its notes and rating guidelines |

The scripts find the tracker through `~/.operator.json`, written during setup, or the `OPERATOR_VAULT` and `OPERATOR_FOLDER` environment variables.
