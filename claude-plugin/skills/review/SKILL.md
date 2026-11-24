---
name: review
description: Run the evidence review - collect new activity from the user's sources as in Routine.md, walk the user through the draft entries, and on the weekly day also focus goals, gap questions and a weekly summary. Use when a scheduled review runs, a message from the scheduled review arrives in the standing review session, the user runs /operator:review, or asks to review evidence drafts or do the weekly part.
---

# Review evidence

Read `${CLAUDE_PLUGIN_ROOT}/references/ai-policy.md` and `${CLAUDE_PLUGIN_ROOT}/references/evidence-rules.md` first and follow them throughout.

`<tracker>` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs"`. `Routine.md` in the tracker folder (`<tracker> where`) lists the user's sources, schedule and signal. If it's missing, review drafts only (steps 3–4) and suggest `/operator:routine`.

The **review** is short: collect, go through drafts, ask about anything else. The **weekly part** adds focus goals, gap questions and a summary. Do the weekly part when `<tracker> health` reports `weekly: not finished`, or when the user asks for it.

## 1. Scheduled runs only: check the time

`<tracker> window`. If it says `closed`, reply with one line saying the review was skipped and why, and stop. Don't notify.

## 2. Collect new activity

Before collecting, hand out the prompts of any source the user runs themselves (Routine.md, method "prompt"), with the dates filled in from that source's cursor up to today, so they can run them while you collect.

For each automatic source in Routine.md, from its cursor up to now (`date -u +%Y-%m-%dT%H:%M:%SZ`):

1. Collect as Routine.md describes. A long gap (after a holiday): split by calendar month.
2. Pick what counts as evidence (evidence-rules.md, and the source's own notes). One piece of work is one entry, even when several sources show it; work that continues an existing entry gets a bullet there.
3. Add new entries as drafts in one `<tracker> add -` call.
4. On success, move the cursor (`<tracker> config <cursor> <until>`) and set `<tracker> config last-mine-status ok`. On failure, `<tracker> config last-mine-status "failed: <short reason> (<date>)"`, leave the cursor, tell the user and go on.

**Scheduled runs:** after collecting, use the signal from Routine.md, then stop. Never confirm or reject drafts yourself.

- *Standing review session*: send one message to the session in `<tracker> config review-session`, e.g. `Review 24 Nov: collected through 14:13 UTC, 2 new drafts (6 open). Prompts due: chat from 21 Nov. Weekly part due: no.` Reply with the same line. If it isn't delivered (session archived or deleted), send a push notification and do the review in this run (steps 3–4), ending with the question.
- *Note in Obsidian*: write that line to `Review waiting.md` in the tracker folder, send a push notification, then show the prompts and the first group of drafts here and end with the question.

**In the standing review session**, when such a message arrives: skip this step unless the message says collection failed, and start at step 3.

## 3. Review the drafts

`<tracker> drafts` lists every draft, grouped by goal. Show them group by group, short: number, title, linked items by their text, bullets. Ask the user to confirm, edit or reject each; accept short answers ("all OK", "reject 3", "2: it was the Circle Lead's idea"). When the user doubts a link, run `<tracker> explain <id>` and re-judge before proposing another link or dropping it.

- Confirm: `<tracker> status <id> confirmed`. Reject: `<tracker> status <id> rejected`.
- Edit: as in evidence-rules.md, then confirm.
- Bullets that say "not merged" or "pending": ask whether that changed.

## 4. Prompt answers and anything else

1. When the user pastes answers to a prompt: check its log for skipped searches or capped results, and give a short follow-up prompt for those. Skip items already logged (same link) and routine ones; propose entries from the rest, with full text. Add approved ones as `confirmed`. Then move that source's cursor to today.
2. Ask in one short question whether anything else happened worth logging: meetings, 1:1s, help given or received. On a weekly-part day, ask about the whole week.

## 5. Weekly part: focus goals

Read `focus` from `<tracker> config`. For each, show its coverage (`<tracker> items`) and ask whether anything happened for it this week. Then ask whether the focus should change. Set it with `<tracker> config focus "[[<file path without .md>#^<id>|<goal text>]]" …` (or `[]`).

## 6. Weekly part: fill gaps

`<tracker> gaps 3`. For 2–3 of them, run `<tracker> explain <ids…>` and ask a concrete question based on the missing facets and the explanation, naming the goal by its text. Ask for the kinds of evidence that are missing (for feedback: positive or critical, role-based or personal). Log answers as in step 4.

Record what you asked: `<tracker> config recently-asked <ids asked now> <ids asked last time>`, at most 6 IDs.

## 7. Finish

1. `<tracker> config last-review-at <now, ISO UTC>`; after the weekly part also `last-weekly-at`.
2. `<tracker> check` must print `No warnings.` Fix or report what it lists; for `#text-changed` items, suggest `/operator:resolve`.
3. If the signal is the Obsidian note, set `Review waiting.md` to "Nothing waiting."
4. Review: one line with confirmed, edited and rejected, and drafts left. Weekly part: a short summary of the week's confirmed, edited and rejected entries; coverage (covered facets now vs. a week ago, from `<tracker> items`); focus goals and their coverage; what's open.
