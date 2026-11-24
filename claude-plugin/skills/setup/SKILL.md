---
name: setup
description: Set up the Matrix Reloaded evidence tracker in the user's Obsidian vault - create the tracker folder, install the Reviewed Entries Obsidian plugin, import the user's profiles from the Matrix Reloaded sheet and split statements into facets. Also re-imports when the sheet or the profiles change. Use when the user wants to start tracking Matrix Reloaded evidence, runs /matrix-reloaded:setup, has a new version of the sheet, or changed their base or growth profile.
---

# Set up the evidence tracker

Read `${CLAUDE_PLUGIN_ROOT}/references/ai-policy.md` first and follow it throughout.

`<tracker>` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs"`, `<import>` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/import.mjs"`.

If `<tracker> where` already prints a location, the tracker exists: skip to [Re-import](#re-import) when the sheet or profiles changed, or ask what the user wants.

## 1. Check the basics

- `node --version` must be 18 or newer. If Node is missing, tell the user to install it (nodejs.org, or their package manager) and stop.
- Ask which Obsidian vault to use (its folder path). Suggest a folder name for the tracker, default `Matrix Reloaded`.
- `<tracker> init --vault "<vault path>" [--folder "<name>"]`. It creates `Overview.md`, `Config.md`, `Statements/`, `Evidence/` and `Source/` in the tracker folder, and saves the location in `~/.matrix-reloaded.json`. It never overwrites existing notes.

## 2. Install the Obsidian plugin

The overview, inbox and review buttons come from the **Reviewed Entries** Obsidian plugin. It isn't in Obsidian's community catalogue, so it's installed from its GitHub releases.

1. Ask before downloading: three files (`main.js`, `manifest.json`, `styles.css`, together under 100 KB) from `https://github.com/developenguin/obsidian-reviewed-entries/releases/latest`.
2. On a yes, download them into `<vault>/.obsidian/plugins/reviewed-entries/` (create the folder).
3. Tell the user to enable it in Obsidian: Settings → Community plugins → turn off Restricted mode if needed → enable **Reviewed Entries**. You can't do this for them.

If the download fails or the user prefers, they can place the three files there by hand.

## 3. Import the statements

1. Ask the user for the Matrix Reloaded sheet as an OpenDocument file (`.ods`): in Google Sheets, File → Download → OpenDocument. Put it in the tracker's `Source/` folder; it must be the only `.ods` there. Ask before replacing an existing one.
2. Ask for their **base profile** (current level) and **growth profile** (the next level), with the sheet names exactly as written, e.g. `Expert - core (7)` and `Expert - master (8)`. Culture is always included. Set them with `<tracker> config base-profile "<name>"` and `<tracker> config growth-profile "<name>"`. If a name is wrong, `<import> --dry-run` lists the sheet names.
3. `<import> --dry-run`, show the report, then `<import>`.

## 4. Split statements into facets

Follow `${CLAUDE_PLUGIN_ROOT}/references/facet-rules.md`. Go dimension by dimension (`<tracker> items`), propose facets for each statement, and let the user correct them before you write them. Then `<import>` again to give the facets IDs, and `<tracker> check` must print `No warnings.`

## 5. Review settings

Show the schedule settings in `Config.md` and ask the user to confirm or change them: `timezone`, `review-days` (e.g. `Mon Tue Wed Thu`), `review-hours` (e.g. `10-16`) and `weekly` (day and hour of the weekly part, e.g. `Thu 15`). Set them with `<tracker> config <key> <value>`.

## 6. Next steps

Tell the user what's next, in one short list:

- `/matrix-reloaded:routine`: choose where evidence comes from and set up daily or weekly reviews.
- `/matrix-reloaded:backfill`: optionally, fill in evidence from earlier months.
- `/matrix-reloaded:log-evidence`: log something right away.
- In Obsidian, open the tracker's `Overview.md` for coverage and the Inbox.

## Re-import

When the sheet has a new version, or the user changes profiles:

1. Ask before replacing the `.ods` in `Source/`. For a profile change, set the new names with `<tracker> config`.
2. `<import> --dry-run`, show the report, then `<import>` once the user agrees.
3. Handle the report:
   - **New statements**: propose facets as in step 4.
   - **Changed statements** (tagged `#text-changed`), **possibly moved statements** and anything `<tracker> check` warns about: hand over to `/matrix-reloaded:resolve`.
   - **Retired statements**: statements that left the sheet, or belong to a profile no longer configured, get `#retired`. They leave the overview but keep their evidence. Mention them; nothing else to do.
   - **Restored statements**: a retired statement came back; its evidence counts again.
