// Optional goal source: imports the statements of Luscii's Matrix Reloaded
// compensation sheet as goals, one file per dimension (see docs/format.md).
// Files it manages have a `profile` property; other goal files are left alone.
//
// Re-runnable: a statement whose text is unchanged keeps its block verbatim,
// facets included. A changed statement gets the new text plus #text-changed
// and keeps its facets. A statement that left the sheet, or a profile that is
// no longer configured, gets #retired so linked evidence keeps resolving.
// Nested bullets without a block ID get one.
//
// The sheet is the one .ods file in the tracker's Source folder. The import
// also writes Rating guidelines.md (shown by `tracker explain`) and puts the
// sheet's profiles and dimensions first in the overview's `order`.
//
// Usage: import-matrix [--dry-run]

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readOds, type Sheet } from './ods.ts';
import { parseItems, type Item } from '../src/model.ts';
import { fail, frontmatter, setProperty, Vault } from './vault.ts';

const vault = new Vault();
const STATEMENTS = vault.path(vault.load().config.itemsFolder);
const GUIDELINES_NAME = 'Rating guidelines.md';
const GUIDELINES = vault.path(`${vault.folder}/${GUIDELINES_NAME}`);
const CULTURE_SHEET = 'Culture Score';
const GUIDELINES_SHEET = 'Session details';

function sourceSheet(): string {
	const folder = vault.path(vault.notes.source);
	const sheets = existsSync(folder) ? readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.ods')) : [];

	if (sheets.length !== 1) {
		fail(`Put exactly one .ods export of the Matrix Reloaded sheet in ${vault.notes.source}/ (found ${sheets.length}).`);
	}

	return join(folder, sheets[0]);
}

const dryRun = process.argv.includes('--dry-run');

interface Statement {
	id: string;
	text: string;
	note: string;
}

interface Dimension {
	name: string;
	question: string;
	note: string;
	statements: Statement[];
}

interface Profile {
	folder: string;
	sheet: string;
	dimensions: Dimension[];
}

interface Block {
	id: string;
	text: string;
	head: string;
	children: string[];
}

const report: Record<'new' | 'changed' | 'moved' | 'retired' | 'restored' | 'ids' | 'written', string[]> = {
	new: [],
	changed: [],
	moved: [],
	retired: [],
	restored: [],
	ids: [],
	written: [],
};

function normalise(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function configValue(key: string): string {
	return vault.setting(key) || fail(`${key} is missing in ${vault.notes.config}.`);
}

function initials(name: string): string {
	return name
		.split(/[\s&-]+/)
		.filter(Boolean)
		.map((word) => word[0].toLowerCase())
		.join('');
}

/** "Expert - core (7)" → folder "Expert core", ID prefix "ec7". */
function describeSheet(name: string): { folder: string; prefix: string } {
	if (normalise(name) === CULTURE_SHEET) {
		return { folder: 'Culture', prefix: 'cu' };
	}

	const match = /^(.+?)\s*-\s*(\w+)\s*\((\d+)\)$/.exec(normalise(name));

	if (!match) {
		throw new Error(`Unexpected sheet name: ${name}`);
	}

	const [, profile, step, level] = match;

	return { folder: `${profile} ${step}`, prefix: `${profile[0]}${step[0]}${level}`.toLowerCase() };
}

function readProfile(sheet: Sheet): Profile {
	const { folder, prefix } = describeSheet(sheet.name);
	const dimensions: Dimension[] = [];

	// Row 0 is the header row.
	for (const row of sheet.rows.slice(1)) {
		const [label, statement] = row;

		// Subscore, Total score, Culture score.
		if (/score$/i.test(label?.text.trim() ?? '')) {
			continue;
		}

		if (label?.text.trim()) {
			const [name, ...question] = label.text.split(':');
			dimensions.push({ name: normalise(name), question: normalise(question.join(':')), note: label.note.trim(), statements: [] });
		}

		const dimension = dimensions.at(-1);

		if (dimension && statement?.text.trim()) {
			const position = dimension.statements.length + 1;
			dimension.statements.push({
				id: `${prefix}-${initials(dimension.name)}${position}`,
				text: normalise(statement.text),
				note: statement.note.trim(),
			});
		}
	}

	return { folder, sheet: normalise(sheet.name), dimensions };
}

const TOP_ITEM = /^[-*+][ \t]+(.*?)[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/;
const NESTED_ITEM = /^([ \t]+)([-*+]|\d+[.)])[ \t]+(.*?)[ \t]*$/;
const BLOCK_ID = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/;
const RETIRED = /[ \t]#retired(?=\s|$)/;

/** Insert #retired before the block ID, unless already there. */
function retire(head: string): string {
	return RETIRED.test(head) ? head : head.replace(BLOCK_ID, ' #retired$&');
}

/** Top-level items with a block ID, plus their indented lines. */
function readBlocks(text: string): Block[] {
	const blocks: Block[] = [];
	let current: Block | null = null;

	for (const line of text.split(/\r?\n/)) {
		const top = TOP_ITEM.exec(line);

		if (top) {
			current = { id: top[2], text: normalise(top[1].replace(/(^|\s)#(text-changed|retired)(?=\s|$)/g, ' ')), head: line, children: [] };
			blocks.push(current);
			continue;
		}

		if (current && (line.trim() === '' || /^[ \t]/.test(line))) {
			current.children.push(line);
			continue;
		}

		current = null;
	}

	for (const block of blocks) {
		while (block.children.length && block.children.at(-1)?.trim() === '') {
			block.children.pop();
		}
	}

	return blocks;
}

/** Give nested bullets without a block ID the next free letter. */
function assignFacetIds(block: Block, dimensionPath: string): string[] {
	const used = new Set(block.children.map((line) => BLOCK_ID.exec(line)?.[1]).filter(Boolean));
	let letter = 0;

	const nextId = (): string => {
		let id: string;

		do {
			id = `${block.id}${String.fromCharCode(97 + letter++)}`;
		} while (used.has(id));

		used.add(id);

		return id;
	};

	return block.children.map((line) => {
		const nested = NESTED_ITEM.exec(line);

		if (!nested || BLOCK_ID.test(line) || !nested[3]) {
			return line;
		}

		const id = nextId();
		report.ids.push(`${dimensionPath}: "${nested[3]}" → ^${id}`);

		return `${line.trimEnd()} ^${id}`;
	});
}

function callout(type: string, title: string, body: string[]): string[] {
	return [`> [!${type}]${body.length ? '-' : ''} ${title}`, ...body.map((line) => (line ? `> ${line}` : '>'))];
}

function sheetNotes(dimension: Dimension): string[] {
	const body: string[] = [];

	if (dimension.note) {
		body.push(...dimension.note.split('\n'));
	}

	dimension.statements.forEach((statement, index) => {
		if (statement.note) {
			body.push('', `**Statement ${index + 1}:** ${normalise(statement.note)}`);
		}
	});

	return body.length ? ['', ...callout('info', 'Sheet notes', body[0] === '' ? body.slice(1) : body)] : [];
}

function renderDimension(profile: Profile, dimension: Dimension, existing: Block[], path: string): string {
	const byId = new Map(existing.map((block) => [block.id, block]));
	const byText = new Map(existing.map((block) => [block.text, block.id]));
	const sheetIds = new Set(dimension.statements.map((statement) => statement.id));
	const lines = [
		'---',
		`title: ${dimension.name}`,
		`profile: ${profile.sheet}`,
		'---',
		'',
		'%% Managed by the importer. Edit only the facet bullets under each statement; new bullets get an ID on the next import. Other edits are overwritten. %%',
	];

	if (dimension.question) {
		lines.push('', ...callout('question', dimension.question, []));
	}

	lines.push(...sheetNotes(dimension), '');

	for (const statement of dimension.statements) {
		const block = byId.get(statement.id);
		const movedFrom = byText.get(statement.text);

		if (movedFrom && movedFrom !== statement.id) {
			report.moved.push(`${path}: "${statement.text}" was ^${movedFrom}, is now position ^${statement.id}. Evidence stays on ^${movedFrom}.`);
		}

		if (!block) {
			report.new.push(`${path}: ^${statement.id} ${statement.text}`);
			lines.push(`- ${statement.text} ^${statement.id}`);
			continue;
		}

		if (block.text === statement.text) {
			if (RETIRED.test(block.head)) {
				report.restored.push(`${path}: ^${statement.id} ${statement.text}`);
			}

			lines.push(block.head.replace(RETIRED, ''));
		} else {
			report.changed.push(`${path}: ^${statement.id}\n    was: ${block.text}\n    now: ${statement.text}`);
			lines.push(`- ${statement.text} #text-changed ^${statement.id}`);
		}

		lines.push(...assignFacetIds(block, path));
	}

	const removed = existing.filter((block) => !sheetIds.has(block.id));

	if (removed.length) {
		lines.push('', '%% Retired: no longer in the sheet. Kept so linked evidence keeps resolving. %%', '');

		for (const block of removed) {
			if (!RETIRED.test(block.head)) {
				report.retired.push(`${path}: ^${block.id} ${block.text}`);
			}

			lines.push(retire(block.head), ...assignFacetIds(block, path));
		}
	}

	return `${lines.join('\n')}\n`;
}

/** Every .md file under the Statements folder, relative to it. */
function statementFiles(folder = ''): string[] {
	const absolute = join(STATEMENTS, folder);

	if (!existsSync(absolute)) {
		return [];
	}

	return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
		const path = folder ? `${folder}/${entry.name}` : entry.name;

		if (entry.isDirectory()) {
			return statementFiles(path);
		}

		return path.endsWith('.md') ? [path] : [];
	});
}

/** Retire every statement in a file of a profile that is no longer configured. */
function retireFile(text: string, path: string): string {
	return text
		.split('\n')
		.map((line) => {
			const top = TOP_ITEM.exec(line);

			if (!top || RETIRED.test(line)) {
				return line;
			}

			report.retired.push(`${path}: ^${top[2]} ${normalise(top[1])}`);

			return retire(line);
		})
		.join('\n');
}

/** The rating guidelines from the Session details sheet: the column-0 rows after "Guidelines". */
function renderGuidelines(sheets: Sheet[]): string {
	const sheet = sheets.find((candidate) => normalise(candidate.name) === GUIDELINES_SHEET);
	const rows = (sheet?.rows ?? []).map((row) => normalise(row[0]?.text ?? '')).filter(Boolean);
	const start = rows.findIndex((text) => /^guidelines$/i.test(text));

	if (start === -1) {
		throw new Error(`No "Guidelines" row in the ${GUIDELINES_SHEET} sheet.`);
	}

	return [
		'# Rating guidelines',
		'',
		`%% Managed by the importer, from the ${GUIDELINES_SHEET} sheet. Edits are overwritten. %%`,
		'',
		...rows.slice(start + 1).map((text) => `- ${text}`),
		'',
	].join('\n');
}

function main(): void {
	const sheets = readOds(sourceSheet());
	const wanted = [configValue('base-profile'), configValue('growth-profile'), CULTURE_SHEET].map(normalise);
	const outputs = new Map<string, string>();
	const order: string[] = [];

	for (const name of wanted) {
		const sheet = sheets.find((candidate) => normalise(candidate.name) === name);

		if (!sheet) {
			throw new Error(`Sheet "${name}" not found. Sheets: ${sheets.map((s) => normalise(s.name)).join(', ')}`);
		}

		const profile = readProfile(sheet);
		order.push(profile.folder, ...profile.dimensions.map((dimension) => dimension.name));

		for (const dimension of profile.dimensions) {
			const path = `${profile.folder}/${dimension.name}.md`;
			const file = join(STATEMENTS, path);
			const existing = existsSync(file) ? readBlocks(readFileSync(file, 'utf8')) : [];
			outputs.set(path, renderDimension(profile, dimension, existing, path));
		}
	}

	const managed = (path: string) => /^profile:/m.test(readFileSync(join(STATEMENTS, path), 'utf8').split(/^---$/m)[1] ?? '');

	for (const path of statementFiles().filter(managed)) {
		if (!outputs.has(path)) {
			outputs.set(path, retireFile(readFileSync(join(STATEMENTS, path), 'utf8'), path));
		}
	}

	const allIds = new Map<string, string>();

	for (const [path, output] of outputs) {
		const flatten = (item: Item): Item[] => [item, ...item.children.flatMap(flatten)];

		for (const item of parseItems(output).flatMap(flatten)) {
			if (allIds.has(item.id)) {
				throw new Error(`Duplicate ID ^${item.id} in ${path} and ${allIds.get(item.id)}.`);
			}

			allIds.set(item.id, path);
		}
	}

	for (const [path, output] of outputs) {
		const file = join(STATEMENTS, path);

		if (existsSync(file) && readFileSync(file, 'utf8') === output) {
			continue;
		}

		report.written.push(path);

		if (!dryRun) {
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, output);
		}
	}

	const guidelines = renderGuidelines(sheets);

	if (!existsSync(GUIDELINES) || readFileSync(GUIDELINES, 'utf8') !== guidelines) {
		report.written.push(GUIDELINES_NAME);

		if (!dryRun) {
			writeFileSync(GUIDELINES, guidelines);
		}
	}

	if (vault.setting('guidelines') !== GUIDELINES_NAME) {
		report.written.push(`guidelines in ${vault.notes.config}`);

		if (!dryRun) {
			vault.write(vault.notes.config, setProperty(vault.read(vault.notes.config), 'guidelines', GUIDELINES_NAME));
		}
	}

	const database = vault.notes.database;
	const current = frontmatter(vault.read(database)).order;
	const existing = Array.isArray(current) ? current : current ? [current] : [];
	const unique = [...new Set([...order, ...existing])];
	const ordered = setProperty(vault.read(database), 'order', unique);

	if (ordered !== vault.read(database)) {
		report.written.push(`order in ${database}`);

		if (!dryRun) {
			vault.write(database, ordered);
		}
	}

	const sections: [keyof typeof report, string][] = [
		['new', 'New statements (need facets)'],
		['changed', 'Changed statements (tagged #text-changed: review their facets)'],
		['moved', 'Possibly moved statements'],
		['retired', 'Retired (no longer in the sheet or profile): tagged #retired, evidence kept'],
		['restored', 'Back in the sheet: #retired removed'],
		['ids', 'Facet IDs assigned'],
		['written', dryRun ? 'Files that would change' : 'Files written'],
	];

	for (const [key, title] of sections) {
		if (report[key].length) {
			console.log(`${title}: ${report[key].length}`);
			report[key].forEach((line) => console.log(`  ${line}`));
		}
	}

	console.log(`Done: ${allIds.size} items (retired included), ${wanted.length} profiles.${dryRun ? ' (dry run)' : ''}`);
}

main();
