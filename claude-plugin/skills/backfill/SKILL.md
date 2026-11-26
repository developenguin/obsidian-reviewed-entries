---
name: backfill
description: Fill the evidence tracker with evidence from earlier months, one month at a time, from the sources in Routine.md. Use when the user runs /operator:backfill or asks to backfill or import older evidence. Never in a scheduled run.
---

# Backfill older evidence

Read `${CLAUDE_PLUGIN_ROOT}/references/ai-policy.md` and `${CLAUDE_PLUGIN_ROOT}/references/evidence-rules.md` first and follow them throughout.

`<tracker>` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs"`. Sources come from `Routine.md` in the tracker folder; if it's missing, suggest `/operator:routine` first.

The backfill fills history from `backfill-start` (or `backfilled-through`, if a backfill already started) up to `backfill-until`, where the regular reviews took over. It never moves the regular cursors.

## Start

If `backfill-start` and `backfill-until` aren't set, ask how far back to go. The guidelines look at the last 8–12 weeks, so a few months is usually enough; older evidence still helps show consistency. Set `backfill-start` (YYYY-MM-DD) and `backfill-until` (the moment regular reviews started, ISO UTC).

## Per calendar month, oldest first

1. Hand out the prompts of sources the user runs themselves, with that month's dates, so they can run them while you collect.
2. Collect the automatic sources for that month only, as Routine.md describes, and add drafts (evidence-rules.md).
3. When prompt answers come in, check their logs for skipped or capped searches, give follow-up prompts where needed, and add drafts from the answers.
4. Review the month's drafts with the user, as in step 3 of the review skill.
5. `<tracker> config backfilled-through <first moment of the next month, ISO UTC>`, then ask whether to continue with the next month.

Prompt-based sources may have usage limits: if the user is close to one, offer to continue the backfill later. Months already done stay done.
