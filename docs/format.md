# File format

A **database** is a set of Markdown files in an Obsidian vault:

- **Items**: things evidence is collected for, arranged in a hierarchy. An importer owns them; the user may edit them.
- **Entries**: records that link to one or more items and carry a review status. Append-only logs.
- **Database note**: one note whose properties configure the database. It usually also holds the overview code block.

A vault can hold several databases. Each has its own database note, items folder and entries folder; folders must not overlap.

Format version: 1.

## Database note

Any note with a `reviewed-db` property.

```yaml
---
reviewed-db: Learning log
items-folder: Learning/Goals
entries-folder: Learning/Log
coverage: all
order:
  - Music
  - Languages
---
```

| Property | Required | Value |
|---|---|---|
| `reviewed-db` | yes | Display name of the database. |
| `items-folder` | yes | Vault path of the folder with item files. Searched recursively. |
| `entries-folder` | yes | Vault path of the folder with entry files. Searched recursively. |
| `coverage` | no | Rule for items with children: `all` (default) or `any`. See [Coverage](#coverage). |
| `order` | no | Folder and file names to sort first, in this order. Everything else sorts by name (natural sort). |

The database note itself is never read as an item or entry file.

## Items

### Hierarchy

The hierarchy comes from three sources, outer to inner:

1. **Folders** under `items-folder`, one level per subfolder depth.
2. **Files** (`.md`).
3. **List items with a block ID** inside a file, nested by indentation.

Folders and files are **groups**: they structure the tree but cannot be linked to. Only list items with a block ID are **items**.

Example: folder = subject, file = topic, top-level list item = goal, nested list item = sub-goal.

### Item file

```markdown
---
title: Spanish
---

Optional free text. Headings and paragraphs are ignored.

- Holds a conversation ^es-1
	- Orders food in a restaurant ^es-1a
	- Asks for directions #text-changed ^es-1b
- Reads a short story ^es-2
```

- **Item**: a list item (`-`, `*`, `+` or `1.`) whose first line ends in a block ID.
- **Block ID**: `^` followed by letters, digits and `-`, at the end of the line. Obsidian hides it in Reading view and Live Preview.
- **ID scope**: unique across all item files of the database. The importer generates IDs and keeps them stable when text changes.
- **Text**: the first line without the block ID and without the `#text-changed` and `#retired` tags. Continuation lines are ignored.
- **Parent**: the nearest enclosing list item that is an item. List items without a block ID are skipped; their children attach to the next item up, or to the file.
- **Text changed**: the `#text-changed` tag marks an item whose text the importer changed after entries may have been linked to it. The overview warns until the user removes the tag.
- **Retired**: the `#retired` tag marks an item that is no longer part of the database. The importer retires items instead of deleting them, so entries keep resolving. A retired item and its children leave the tree and coverage, and show in a separate Retired section with their entries. Only delete an item when no entry links to it.
- **File title**: the `title` property, or the file name without `.md`.

## Entries

### Entry file

Any `.md` file under `entries-folder`. Convention: one per month, `YYYY-MM.md`.

```markdown
# 2026-10

## 2026-10-28 Ordered dinner and asked for the bill in Spanish
id:: 20261028-a3f9
status:: draft
items:: [[Spanish#^es-1a|Orders food in a restaurant]], [[Guitar#^gt-2|Tunes by ear]]
source:: practice notes

Whole conversation without switching to English.

## 2026-10-29 Read a short story without a dictionary
id:: 20261029-0c1e
status:: confirmed
items:: [[Spanish#^es-2|Reads a short story]]
```

- **Entry**: starts at a level-2 heading (`## `) and runs to the next heading of level 1 or 2. Other headings and text outside entries are ignored.
- **Heading**: `YYYY-MM-DD` followed by a title. Without a date the whole heading is the title.
- **Fields**: lines `key:: value`, optionally as a list item (`- key:: value`). Keys are case-insensitive. A repeated key appends to the earlier value.
- **Body**: all other lines in the entry. Free text, shown in Obsidian, not used by the overview.

| Field | Required | Value |
|---|---|---|
| `id` | yes | Unique across the entries of the database. Convention: `YYYYMMDD-` plus 4 random hex characters. |
| `status` | yes | `draft`, `confirmed` or `rejected`. |
| `items` | yes | One or more item links, separated by commas. |
| other | no | Kept as text, shown nowhere in v1 (e.g. `source`). |

### Item links

```markdown
[[Spanish#^es-1a|Orders food in a restaurant]]
```

- An entry resolves a link by its block ID only (`es-1a`). The file part (`Spanish`) and the alias only serve navigation and reading in Obsidian; a stale file name or alias does not break the link.
- The alias is a snapshot of the item text when the entry was written. The overview shows the current item text.
- Links without a `#^id` part are ignored with a warning.

### Statuses

| Status | Set by | Counts towards coverage |
|---|---|---|
| `draft` | Claude, when it adds the entry | no |
| `confirmed` | the user, after review | yes |
| `rejected` | the user, after review | no |

Log files are append-only: new entries go at the end, entries are never deleted. Confirm and reject change only the `status` line of an entry; see [Review](#review).

## Coverage

- A **leaf item** (no child items) is covered when at least one `confirmed` entry links to it.
- An **item or group with children** is covered according to `coverage`:
  - `all`: every child is covered.
  - `any`: at least one child is covered.
- A group with no items at all is not shown.
- Retired items are left out: they don't count as missing, and don't count towards their parent.
- An entry linked to an item with children counts in that item's totals, but does not cover the children or the item.

Counts per row are distinct entries in that row's subtree: an entry linked to two children of one item counts once for that item.

## Overview code block

````markdown
```reviewed-db
db: Learning/Learning log
view: overview
filter: missing
```
````

| Key | Required | Value |
|---|---|---|
| `db` | no | Path of the database note, with or without `.md`. Default: the note that contains the block. |
| `view` | no | Tab to show first: `overview` (default) or `inbox`. |
| `filter` | no | Overview only. Initial filter: `all` (default), `missing` or `drafts`. The overview also has a control to change it. |

The block shows two tabs, **Overview** and **Inbox (N)**, with N the number of drafts. Text sizes follow the note's font size; secondary text never goes below 14px.

### Overview

- Totals: missing lowest-level items, confirmed entries and drafts.
- One card per top-level group, with a collapsible row per group and item: a `Missing` label when the row is not covered, and counts as `N entries · N drafts`. `entries` counts confirmed entries only; zero counts are left out.
- Under each item, its linked entries: date, title (links to the entry), status as text.
- A collapsed **Retired** section after the tree: retired items with their path and entries.
- Filters: `missing` shows only rows that are not covered; `drafts` shows only rows with draft entries in their subtree, and only their draft entries.
- Warnings, in a collapsed section above the tree. Messages name entries by date and title and items by text, never by ID:

| Warning | Cause |
|---|---|
| Broken link | An entry links to a block ID that no item has. Retire items instead of deleting them. |
| Text changed | An item has the `#text-changed` tag. |
| Duplicate ID | Two items, or two entries, share an ID. |
| Invalid status | An entry has no `status`, or a value other than the three statuses. |
| Missing ID | An entry has no `id`. |
| No items | An entry has no item links. |
| Unresolved link | An `items` link has no `#^id` part. |

### Inbox

For triaging drafts. For a separate inbox note, add a block with `db` and `view: inbox`. One card per `draft` entry, oldest first:

- Title (links to the entry) and date.
- Body, rendered as Markdown.
- Other fields as `key: value`.
- Linked items: current text (links to the item), its path, and `Retired`, `Text changed`, `No longer exists` or `Not an item` where that applies.

### Command

The command **Reviewed Entries: Open database** opens a database note; with several databases it asks which one.

## Review

Writes go through Obsidian's `vault.process`, which re-reads the file first, and find the entry by its `id`. An entry without an `id`, or with an `id` used twice, can't be reviewed from the views.

| Action | Where | Changes |
|---|---|---|
| Confirm, Reject | Inbox card | Only the entry's `status::` line. |
| Edit | Inbox card, entry row in the overview | The whole entry: heading, `id`, `status`, `items`, other fields, body. Opens a form with title, date, status, description and linked items (searchable picker; retired items can't be picked). The entry stays in its file, also when its date changes. |
| New entry | Button next to the tabs | Appends to `entries-folder/YYYY-MM.md` for the entry's date, creating the file (with a `# YYYY-MM` heading) if needed. Default status `confirmed`. |

An edited or new entry is written in this layout: heading, then `id`, `status`, `items` and other fields one per line without list markers, a blank line, then the body. Body lines that would read as a heading (`# `, `## `) or a field (`key::`) are escaped with a backslash; lines inside code fences are kept as they are.
