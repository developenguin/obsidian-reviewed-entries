# Reviewed Entries

Obsidian plugin: a database of **items** (a hierarchy in Markdown files) and **entries** (append-only log records that link to items and carry a review status). Renders a coverage overview and an inbox in a note, where you confirm, reject, edit and add entries.

- Format and configuration: [docs/format.md](docs/format.md)
- Works on desktop and mobile. Uses only Obsidian's public API; no other plugins needed.

## Use

1. Create a database note with the properties from [docs/format.md](docs/format.md#database-note).
2. Add a code block to it:

   ````markdown
   ```reviewed-db
   ```
   ````

3. Drafts to review are in the block's **Inbox** tab. For a separate inbox note, add a block with `db: <database note>` and `view: inbox`.
4. Command **Reviewed Entries: Open database** opens a database note.

## Develop

Yarn 4 with Plug'n'Play; no `node_modules`.

| Command | Does |
|---|---|
| `yarn install` | Install dev dependencies |
| `yarn build` | Typecheck and build `main.js` |
| `yarn dev` | Rebuild on change |
| `yarn test` | Run model tests against `fixture/` |

Set `OBSIDIAN_VAULT` to copy `main.js`, `manifest.json` and `styles.css` into `$OBSIDIAN_VAULT/.obsidian/plugins/reviewed-entries/` after each build:

```bash
OBSIDIAN_VAULT=~/path/to/vault yarn build
```

`fixture/` is a small test vault: `OBSIDIAN_VAULT=$PWD/fixture yarn build`, then open the folder as a vault in Obsidian.

### Layout

| File | Role |
|---|---|
| `src/model.ts` | Parser, coverage and entry writing (`setEntryStatus`, `replaceEntry`, `appendEntry`). No Obsidian imports; Node scripts can import it directly. |
| `src/view.ts` | Renders the overview and inbox into plain DOM. |
| `src/entry-modal.ts` | Form to edit or add an entry, with the item picker. |
| `src/main.ts` | Obsidian glue: code block, command, file events. |
