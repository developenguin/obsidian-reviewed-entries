---
name: setup
description: Set up the Operator evidence tracker in the user's Obsidian vault - create the tracker folder, install the Reviewed Entries Obsidian plugin, and set up the goals evidence is logged against (written from what the user describes, or imported from Luscii's Matrix Reloaded sheet), split into facets. Also adds or changes goals later, and re-imports the Matrix sheet. Use when the user wants to start logging evidence, runs /operator:setup, wants to add or change goals, or has a new Matrix Reloaded sheet or profile.
---

# Set up the evidence tracker

Read `${CLAUDE_PLUGIN_ROOT}/references/ai-policy.md` first and follow it throughout. Goal files follow `${CLAUDE_PLUGIN_ROOT}/references/goal-format.md`, facets `${CLAUDE_PLUGIN_ROOT}/references/facet-rules.md`.

`<tracker>` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs"`, `<import-matrix>` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/import-matrix.mjs"`.

If `<tracker> where` already prints a location, the tracker exists: ask whether the user wants to add or change goals (step 3), re-import the Matrix sheet ([Re-import](#re-import-the-matrix-sheet)), or something else.

## 1. Check the basics

- `node --version` must be 18 or newer. If Node is missing, tell the user to install it (nodejs.org, or their package manager) and stop.
- Ask which Obsidian vault to use (its folder path) and a name for the tracker folder, default `Evidence`.
- `<tracker> init --vault "<vault path>" [--folder "<name>"]`. It creates `Overview.md`, `Config.md`, `Goals/`, `Log/` and `Source/` in the tracker folder, and saves the location in `~/.operator.json`. It never overwrites existing notes.

## 2. Install the Obsidian plugin

The overview, inbox and review buttons come from the **Reviewed Entries** Obsidian plugin. It isn't in Obsidian's community catalogue, so it's installed from its GitHub releases.

1. Ask before downloading: three files (`main.js`, `manifest.json`, `styles.css`, together under 100 KB) from `https://github.com/developenguin/obsidian-reviewed-entries/releases/latest`.
2. On a yes, download them into `<vault>/.obsidian/plugins/reviewed-entries/` (create the folder).
3. Tell the user to enable it in Obsidian: Settings → Community plugins → turn off Restricted mode if needed → enable **Reviewed Entries**. You can't do this for them.

If the download fails or the user prefers, they can place the three files there by hand.

## 3. Set up goals

Ask what the user wants evidence for. They can combine sources; each gets its own folder under `Goals/`.

**Goals the user describes or pastes** (development goals, OKRs, role accountabilities, a job profile, a document):

1. Collect the goals in the user's words. Ask what counts as evidence for each and what doesn't, and whether there are general rules for judging evidence.
2. Group them into files (a theme, an objective, a role) and propose the goals, facets and notes as in goal-format.md and facet-rules.md. Keep the user's wording; don't add goals they didn't ask for.
3. On the user's yes, write the files and, if there are general rules, the guidelines note. `<tracker> check` must print `No warnings.`

**Luscii's Matrix Reloaded sheet** (compensation statements per profile):

1. Ask for the sheet as an OpenDocument file (`.ods`): in Google Sheets, File → Download → OpenDocument. Put it in the tracker's `Source/` folder; it must be the only `.ods` there. Ask before replacing an existing one.
2. Ask for their **base profile** (current level) and **growth profile** (the next level), with the sheet names exactly as written, e.g. `Expert - core (7)` and `Expert - master (8)`. Culture is always included. Set them with `<tracker> config base-profile "<name>"` and `<tracker> config growth-profile "<name>"`. If a name is wrong, `<import-matrix> --dry-run` lists the sheet names.
3. `<import-matrix> --dry-run`, show the report, then `<import-matrix>`. It writes one file per dimension, the sheet's notes, and `Rating guidelines.md`.
4. Split the statements into facets, dimension by dimension (`<tracker> items`, `<tracker> explain`), following facet-rules.md. Let the user correct them before writing. Then `<import-matrix>` again to give the facets IDs, and `<tracker> check`.

## 4. Review settings

Show the schedule settings in `Config.md` and ask the user to confirm or change them: `timezone`, `review-days` (e.g. `Mon Tue Wed Thu`), `review-hours` (e.g. `10-16`) and `weekly` (day and hour of the weekly part, e.g. `Thu 15`). Set them with `<tracker> config <key> <value>`.

## 5. Next steps

Tell the user what's next, in one short list:

- `/operator:routine`: choose where evidence comes from and set up daily or weekly reviews.
- `/operator:backfill`: optionally, fill in evidence from earlier months.
- `/operator:log-evidence`: log something right away.
- In Obsidian, open the tracker's `Overview.md` for coverage and the Inbox.

## Re-import the Matrix sheet

When the sheet has a new version, or the user changes profiles:

1. Ask before replacing the `.ods` in `Source/`. For a profile change, set the new names with `<tracker> config`.
2. `<import-matrix> --dry-run`, show the report, then `<import-matrix>` once the user agrees.
3. Handle the report:
   - **New statements**: propose facets as in step 3.
   - **Changed statements** (tagged `#text-changed`), **possibly moved statements** and anything `<tracker> check` warns about: hand over to `/operator:resolve`.
   - **Retired statements**: statements that left the sheet, or belong to a profile no longer configured, get `#retired`. They leave the overview but keep their evidence. Mention them; nothing else to do.
   - **Restored statements**: a retired statement came back; its evidence counts again.
