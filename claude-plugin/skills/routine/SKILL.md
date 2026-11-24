---
name: routine
description: Set up or change the user's evidence routine - which sources evidence comes from and how to collect each one, how often reviews run, and how the user hears that a review is waiting. Writes Routine.md in the tracker folder and creates the scheduled tasks. Use when the user runs /operator:routine, wants to add or drop a source, or change when or how reviews happen.
---

# Set up the review routine

Read `${CLAUDE_PLUGIN_ROOT}/references/ai-policy.md` first. Every source must pass it: approved connections only, read-only, and no new connections set up by you.

`<tracker>` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs"`. `<tracker> where` prints the tracker folder; it must exist (else run `/operator:setup` first).

The result is `Routine.md` in the tracker folder: the user's own collection plan, which the review and backfill skills follow. Nothing in it is prebuilt; you work it out with the user. If it exists, show it and ask what to change.

## 1. Sources

Ask where the user's evidence happens. Offer these kinds, and let them add others:

| Kind | Examples | Typical way to collect |
|---|---|---|
| Claude Code sessions | Work done with Claude | Read the session logs in `~/.claude/projects/` for the period: prompts, summaries, files touched. Always available. |
| Code hosting | Pull requests, reviews | An approved CLI or connector, read-only, e.g. merged PRs and substantial reviews by the user |
| Issue tracker | Tickets, comments, projects | An approved connector, read-only |
| Chat | Threads, DMs, kudos | Often no approved read access: then a prompt the user runs themselves (e.g. in Slack's own AI) and pastes back |
| Meetings and documents | Notes, decisions, proposals | An approved connector, or the user pastes or summarises |
| Manual | 1:1s, help given, feedback | A question in the review: "anything else worth logging?" |

For each source the user picks, decide with them:

1. **Access**: which connection, and is it on Luscii's approved list? If unsure, the user checks. If it needs a connection that isn't set up, tell them and stop for that source.
2. **Method**, the simplest that works:
   - *Claude reads it directly* (a connector, a CLI command, files on disk): write down the exact read-only calls or commands and what to look for.
   - *A small collector script*: only if the user wants one. Write it with them into `Collectors/` in the tracker folder, read-only, printing JSON for Claude to judge. Test it once on a short period.
   - *A prompt the user runs elsewhere*: write the prompt with them for that tool's limits (small date windows, one kind of search per prompt, ask it to stop and continue instead of skipping). The review hands it out with dates filled in.
3. **What counts**: what in this source is evidence and what is routine noise.
4. **Cursor**: the Config property that records how far it's been collected, e.g. `last-mined-at` for automatic sources, or `last-<source>-at` for manual ones. Set it to today, or to the start of the backfill.
5. **Duplicates**: what the entry `ref` is for this source (a URL, an ID), so the tracker skips what's logged.

## 2. Schedule

Ask how often to review (daily on review days, or weekly) and confirm `review-days`, `review-hours`, `weekly` and `timezone` in Config (`<tracker> config`).

Reviews run as scheduled tasks in the Claude desktop app. Create them with the scheduled-task tools, after showing the user the schedule and prompt:

- **Review**: on the review days, inside the review hours. Prompt: run the `operator:review` skill as a scheduled run, following `Routine.md`. The skill checks `<tracker> window` and stops when closed.
- **Health check** (optional): once a week, on the first review day. Prompt: run `<tracker> window` (stop if closed), then `<tracker> health`; if it prints problems, tell the user through the notification route below; if `OK`, stay silent.

Scheduled tasks only run while the desktop app is open and the computer awake. Say so.

## 3. How the user hears a review is waiting

App notifications don't show while the user is active in the app, and scheduled runs can't be pinned. Let the user choose a persistent signal:

| Option | How it works |
|---|---|
| **Standing review session** | Start one session titled "Evidence review" (the session tools, `user_asked`) whose brief is: when a message from the scheduled review arrives, run `operator:review` from the review step and end waiting on the user. Save its ID with `<tracker> config review-session <id>`. Each run collects, then messages that session; it shows in the sidebar as waiting until handled. |
| **Note in Obsidian** | Each run writes `Review waiting.md` in the tracker folder: date, new and open drafts, what's due. The review sets it to "Nothing waiting." when done. |

Either way, the run also sends a push notification for when the app is in the background.

## 4. Write Routine.md

```markdown
# Routine

## Sources

### <Source name>
- Access: <connection, approved: yes>
- Method: <direct | collector script `Collectors/<file>` | prompt the user runs>
- Collect: <exact commands, calls or the prompt, with {start date} and {end date}>
- Counts as evidence: <…>
- Skip: <…>
- Cursor: `<config key>`
- Ref: <…>

## Schedule
- Review: <days and time>; weekly part: <day and hour>
- Health check: <yes/no, when>

## Signal
- <Standing review session (`review-session` in Config) | Review waiting.md>
```

Then show the user a summary and suggest `/operator:backfill` if they want earlier months.
