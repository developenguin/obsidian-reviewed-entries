---
name: log-evidence
description: Log Matrix Reloaded evidence right away - from the work done in the current session, or from something the user describes in their own words (a meeting, feedback, help given). Use when the user says "log evidence", "log this" or "add this as evidence", accepts an offer to log evidence, or runs /matrix-reloaded:log-evidence.
---

# Log evidence

Read `${CLAUDE_PLUGIN_ROOT}/references/ai-policy.md` and `${CLAUDE_PLUGIN_ROOT}/references/evidence-rules.md` first and follow them.

`<tracker>` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs"`. If `<tracker> where` fails, the tracker isn't set up: suggest `/matrix-reloaded:setup` and stop.

## 1. What to log

- **From this session**: what the user did in it. Usually one entry, at most three. Skip routine work.
- **From the user's words**: what they describe, as they describe it. Ask at most one or two short follow-ups (when, what came of it, where it's visible) and don't invent details.

If it's unclear what the user wants logged, ask one short question.

## 2. Link and write

Match statements with `<tracker> items` and `<tracker> explain` as evidence-rules.md describes. For an entry about this session's work, use ref `claude-code:${CLAUDE_SESSION_ID}` (add `#2`, `#3` for more entries), unless it's about a PR or issue: then its URL.

## 3. Show, then add

Show each entry in full, with linked items by their text. On the user's yes, add it with `<tracker> add -`:

- as `confirmed` when the user approved the text and links here;
- as `draft` when they'd rather decide in the next review.

## 4. Report

One line per entry: title → linked statement or facet texts, and its status. Drafts show up in the next review and in the Inbox tab of the tracker's `Overview.md`.
