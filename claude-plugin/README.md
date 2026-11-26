# Operator (Claude plugin)

Logs evidence of your work against your own goals, in an Obsidian vault shown with the [Reviewed Entries](../README.md) Obsidian plugin. Goals can be anything you want evidence for: development goals, OKRs, role accountabilities, or Luscii's Matrix Reloaded compensation statements, which it can import directly. Evidence only: no grading.

Each goal can split into **facets**: parts of the same goal that each need their own evidence. A goal counts as covered when every facet has confirmed evidence.

You work with it by talking to Claude (`/operator:setup` to start) and, if you use Obsidian, by looking at the overview there. You never run commands or build anything.

## Skills

| Skill | Does |
|---|---|
| `/operator:setup` | Create the tracker folder, optionally install the Obsidian plugin, and set up your goals and facets: from your own words, or imported from the Matrix Reloaded sheet. Also adds goals later and re-imports the sheet. |
| `/operator:routine` | Choose what work to track, where it happens and how to collect it, schedule reviews, and choose how you hear a review is waiting. Writes `Routine.md`. |
| `/operator:backfill` | Fill in evidence from earlier months, one month at a time. |
| `/operator:log-evidence` | Log evidence now, from this session or from your own words. |
| `/operator:review` | Collect new activity, review drafts; weekly: focus goals, gap questions, summary. |
| `/operator:resolve` | Fix changed goals after a re-import, and tracker warnings. |
| `offer-logging` | Not invoked: Claude offers to log evidence after notable work. |

All skills follow [`references/ai-policy.md`](references/ai-policy.md) (Luscii's AI policy: approved connections only, read-only, no secrets, patient data or colleagues' names in evidence) and [`references/evidence-rules.md`](references/evidence-rules.md). Nothing in the plugin collects from a specific source: the routine skill works out with you how to collect from yours, and keeps that in your tracker folder.

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
