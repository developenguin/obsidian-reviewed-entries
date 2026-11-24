# Matrix Reloaded (Claude plugin)

Collects evidence for your Luscii Matrix Reloaded compensation statements in an Obsidian vault, shown with the [Reviewed Entries](../README.md) Obsidian plugin. Evidence only: no grading, no salary.

## Requirements

- Claude Code (the desktop app for scheduled reviews)
- Obsidian with the Reviewed Entries plugin
- Node 18 or newer

## Scripts

`scripts/` holds the bundled command-line tools the skills call. They are generated from [`cli/`](../cli) with `yarn build:cli`; don't edit them.

| Script | Does |
|---|---|
| `tracker.mjs` | Set up the tracker folder, list statements and coverage, add and review entries, explain statements, settings, review window and health |
| `import.mjs` | Import statements from the Matrix Reloaded sheet (`.ods`) into the vault, and the rating guidelines |

The tracker finds your vault through `~/.matrix-reloaded.json`, written by `tracker.mjs init`, or the `MATRIX_RELOADED_VAULT` and `MATRIX_RELOADED_FOLDER` environment variables.
