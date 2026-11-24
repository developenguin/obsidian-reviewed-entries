# Writing evidence

Shared by every skill that proposes, writes or edits evidence. `<tracker>` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs"`.

## What counts

- Evidence is an objective log, not a brag sheet. Log what **the user** did: decided, designed, analysed, built, reviewed, explained, pushed back on, coached, improved, gave or acted on feedback. Work done with Claude's help counts as theirs; describe their role, not Claude's.
- Credit others' groundwork in the bullets. Describe outcomes as they were, including "not live yet", "outcome unknown" or "the proposal was rejected".
- Skip routine work: version bumps, dependency updates, small fixes, ordinary tickets without a notable decision, sessions that only asked a question.
- Small examples (one library choice, one quick fix) are worth an entry only while the facet has no stronger evidence.
- Requests that reach the user through a role they hold count as recognition of their expertise too.

## Linking statements

1. `<tracker> items` lists statements and facets with IDs, coverage and `[Focus]` markers.
2. **Always** run `<tracker> explain <ids…>` for every candidate, in one call. It prints the dimension notes, the statement's own note (with "Not this:" examples) and the rating guidelines. Link only when the explanation supports the match, not the wording alone.
3. Take "is able to X" versus "does X" literally. For a growth profile, measure against the level its dimension notes describe.
4. Link one to three items that plainly fit. A large project (a multi-month migration, a new app) may link more, as long as each link is warranted on its own. When a statement has facets, link the facets.
5. Don't stretch a match to fill a gap. If nothing fits, propose no link and say why.
6. When showing a proposal to the user, name each linked item by its text (facet and statement), never by ID alone.

## Rating guidelines to keep in mind

From the sheet (`<tracker> explain` prints them in full): a statement counts only when every part of it is true, the behaviour is consistent over the last 8–12 weeks, and there is a concrete example. Evidence should make that visible: concrete examples, spread over time.

## Entry format

| Field | Rule |
|---|---|
| `date` | The day the work happened (merge date for PRs), `YYYY-MM-DD`. |
| `title` | At most 8 words, past tense, verb first. |
| `body` | 2–4 short bullets in plain language: what, why, result. |
| `source` | Where it happened, as a Markdown link if there is one, e.g. `[org/repo#123](url)`, else a plain description such as `Claude Code session: <project folder>` or `Slack DM`. |
| `ref` | A stable key that prevents duplicates: the URL of the PR, issue or message; else `claude-code:<session id>`, or `manual:<date>-<short-slug>`. |
| `status` | `draft` by default. `confirmed` only when the user wrote or approved the text and links. |

- Work that continues an existing entry (a follow-up PR, the next step) gets a bullet in that entry instead of a new one.
- Feedback entries say whether the feedback was positive or critical, and whether it was role-based or personal.
- Reviews of others' work (code reviews, document reviews) go into one entry per month, ref `<kind>-reviews:YYYY-MM`, for substantial reviews only: design feedback, caught bugs, coaching.
- Keep Luscii and Dutch terms as they are (circle, tension, ZorgBijJou). Luscii uses Holacracy constitution v5: Circle Lead, not Lead Link.

## Adding entries

```bash
<tracker> add - <<'EOF'
[{"date": "2026-10-28", "title": "…", "items": ["<facet id>"], "source": "…", "ref": "…", "body": ["…", "…"]}]
EOF
```

The tracker refuses unknown or retired items and text that looks like a secret or personal data: rephrase and retry. It skips entries whose `ref` is already logged.

## Editing entries

Edit only that entry in its `Evidence/YYYY-MM.md` file: title, `items::` links, bullets. Keep `id::`, `ref::` and the heading date. Change status with `<tracker> status <id> <draft|confirmed|rejected>`. Never delete entries; reject them.
