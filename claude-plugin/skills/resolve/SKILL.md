---
name: resolve
description: Resolve conflicts in the Matrix Reloaded evidence tracker - statements whose text changed after a re-import (#text-changed), possibly moved statements, and warnings from the tracker check such as links to retired or unknown items. Use when the user runs /matrix-reloaded:resolve, an import or review reports changed statements or warnings, or the Obsidian overview shows "Text changed".
---

# Resolve conflicts

Read `${CLAUDE_PLUGIN_ROOT}/references/ai-policy.md`, `${CLAUDE_PLUGIN_ROOT}/references/evidence-rules.md` and `${CLAUDE_PLUGIN_ROOT}/references/facet-rules.md` first.

`<tracker>` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs"`.

## 1. Find the conflicts

- `<tracker> check` lists warnings with file and line.
- Statements tagged `#text-changed` in the dimension files under `Statements/`: the sheet changed their text. The import report shows old and new text; if it's no longer at hand, the old text is in the linked entries' `items::` labels.

Show the user a short list, grouped by kind, before changing anything.

## 2. Changed statements

Per statement:

1. `<tracker> explain <statement id>` for the new text and notes.
2. Compare old and new text. Propose facet changes: keep facet IDs whose meaning stays the same, so linked evidence stays valid; add new facets without IDs; retire facets that no longer apply (`#retired` before the block ID, never delete facets with evidence).
3. Check each entry linked to the statement or its facets against the new meaning. Propose relinking or dropping links that no longer fit, as evidence-rules.md describes. Never reject entries yourself.
4. On the user's yes, make the changes, run the import again if facets were added (`node "${CLAUDE_PLUGIN_ROOT}/scripts/import.mjs"`), and remove the `#text-changed` tag from the statement line. The user can also do this last step with the **Resolve** button in Obsidian's overview.

## 3. Possibly moved statements

The import matches statements by position. When a statement moved, its evidence stays on the old ID. Explain the effect and ask the user: relink the entries to the new ID, or leave them. Don't delete anything.

## 4. Other warnings

- **Link to a retired item**: propose a current item that the explanation supports, or keep the link (retired evidence still shows the history). The user decides.
- **Unknown item or broken link**: find what it was meant to be (label, nearby statements) and propose the fix.
- **Duplicate or malformed entries**: show both and ask which to keep; reject rather than delete.

## 5. Finish

`<tracker> check` must print `No warnings.`, or list what the user chose to leave. Summarise what changed in one short list.
