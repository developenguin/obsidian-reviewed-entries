# Goal files

Goals live as Markdown files in the goals folder (the overview's `items-folder`, usually `Goals/` in the tracker folder). Folders and files group them: the overview shows `Folder › File › goal`.

```markdown
---
title: Learning
---

> [!question] Am I growing my skills?

> [!info]- Notes
> What counts for every goal in this file.
> **^pg-l1:** What counts for this goal only, e.g. "Not this: talks inside my own team."

- Give a talk at a meetup outside my team ^pg-l1
- Finish the Rust course ^pg-l2
	- Complete the exercises ^pg-l2a
	- Build a small command-line tool with it ^pg-l2b
```

- **Goals** are the top-level bullets. **Facets** are bullets nested under a goal: parts of the same goal that each need their own evidence (see `facet-rules.md`).
- Every goal and facet ends with a block ID (`^id`): lowercase letters, digits and dashes, unique in the vault. Use a short prefix per file plus a number for goals (`pg-l1`, `pg-l2`), and the goal's ID plus a letter for its facets (`pg-l2a`). Never change an ID once evidence links to it.
- The `question` callout and the `Notes` callout are optional. `tracker explain` prints them; write in them what the user says counts as evidence, and what doesn't ("Not this: …").
- A guidelines note in the tracker folder (Config `guidelines`, default `Guidelines.md`) holds rules for judging evidence that apply to all goals, as `- ` bullets. Optional.
- To drop a goal or facet that evidence links to, add `#retired` before its block ID instead of deleting it. Its evidence stays readable.
- `<tracker> check` must print `No warnings.` after any change.

## Files from the Matrix Reloaded importer

Files with a `profile` property are managed by `import-matrix.mjs`: one file per dimension, goals from the sheet, notes from its cell comments. Edit only the nested facet bullets in them; the importer overwrites the rest, and gives facets without an ID one on the next import. It never touches other goal files.
