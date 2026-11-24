// Command-line helper for the Matrix Reloaded evidence skills.
//
//   tracker init --vault <path> [--folder <name>]  set up the tracker folder
//   tracker where                     vault and tracker folder in use
//   tracker items [--json]            statements and facets, with coverage
//   tracker add <file.json|->         append entries (see AddInput)
//   tracker check                     warnings from the database
//   tracker drafts                    draft entries, grouped by statement
//   tracker status <id> <draft|confirmed|rejected>
//   tracker explain <id…>             what a statement means: sheet notes, facets, rating guidelines
//   tracker gaps [count]              statements to ask about, rotating
//   tracker config [key [value…]]     read or set a Config.md property
//   tracker window                    is it inside the review days and hours?
//   tracker health                    did the last weekly part and collection succeed?

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { setEntryStatus, STATUSES, type Node, type Status } from '../src/model.ts';
import { fail, notes, setProperty, SETTINGS_FILE, Vault } from './vault.ts';

interface AddInput {
	/** Date of the activity, YYYY-MM-DD. */
	date: string;
	title: string;
	/** Block IDs of statements or facets. */
	items: string[];
	/** Where it happened, Markdown allowed, e.g. "[org/repo#123](https://…)". */
	source: string;
	/** Stable key to skip duplicates: a URL, or "claude-code:<session id>". */
	ref: string;
	/** Short bullet points. */
	body: string[];
	/** Default draft. Only use confirmed when the user wrote or approved the entry. */
	status?: 'draft' | 'confirmed';
}

/** Patterns that suggest a secret or personal data slipped into an entry. */
const SENSITIVE: [RegExp, string][] = [
	[/\b(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]+)/, 'API token'],
	[/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
	[/\b(password|passwd|wachtwoord|secret)\s*[:=]/i, 'password or secret'],
	[/\b\d{9}\b/, '9-digit number (possible BSN)'],
	[/\b[\w.+-]+@[\w-]+\.[\w.]+\b/, 'email address'],
];

function walk(node: Node, visit: (node: Node, depth: number) => void, depth = 0): void {
	visit(node, depth);
	node.children.forEach((child) => walk(child, visit, depth + 1));
}

function status(node: Node): string {
	const counts = [node.confirmed && `${node.confirmed} confirmed`, node.drafts && `${node.drafts} draft`].filter(Boolean);

	return `${node.covered ? 'Covered' : 'Missing'}${counts.length ? `, ${counts.join(', ')}` : ''}`;
}

function items(json: boolean): void {
	const vault = new Vault();
	const { db } = vault.load();
	const focus = vault.focusIds();
	const rows: object[] = [];

	walk(db.root, (node, depth) => {
		if (depth === 0) {
			return;
		}

		if (json) {
			if (node.kind === 'item') {
				rows.push({
					id: node.key,
					text: node.label,
					trail: node.trail,
					leaf: node.children.length === 0,
					covered: node.covered,
					confirmed: node.confirmed,
					drafts: node.drafts,
					focus: focus.has(node.key),
				});
			}

			return;
		}

		const indent = '  '.repeat(depth - 1);
		const label = node.kind === 'group' ? `## ${node.label}` : `${node.key} | ${node.label}`;
		console.log(`${indent}${label} [${status(node)}]${focus.has(node.key) ? ' [Focus]' : ''}`);
	});

	if (json) {
		console.log(JSON.stringify(rows, null, '\t'));
	}
}

function check(): void {
	const { db } = new Vault().load();

	if (!db.warnings.length) {
		console.log('No warnings.');
	}

	for (const warning of db.warnings) {
		console.log(`${warning.kind}: ${warning.message} (${warning.path}:${warning.line + 1})`);
	}
}

function validate(input: AddInput, known: Map<string, Node>): string[] {
	const problems: string[] = [];

	if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '')) {
		problems.push(`date must be YYYY-MM-DD, got ${input.date}`);
	}

	for (const key of ['title', 'source', 'ref'] as const) {
		if (!input[key]?.trim()) {
			problems.push(`${key} is empty`);
		}
	}

	if (!input.items?.length) {
		problems.push('items is empty');
	}

	for (const id of input.items ?? []) {
		const node = known.get(id);

		if (!node) {
			problems.push(`unknown item ${id}`);
		} else if (node.retired) {
			problems.push(`item ${id} is retired`);
		}
	}

	if (input.status && input.status !== 'draft' && input.status !== 'confirmed') {
		problems.push(`status must be draft or confirmed, got ${input.status}`);
	}

	const text = [input.title, input.source, ...(input.body ?? [])].join('\n');

	for (const [pattern, label] of SENSITIVE) {
		if (pattern.test(text)) {
			problems.push(`looks like it contains a ${label}: rephrase without it`);
		}
	}

	return problems;
}

function render(input: AddInput, id: string, known: Map<string, Node>): string {
	const links = input.items.map((itemId) => {
		const node = known.get(itemId) as Node;
		const alias = node.label.replace(/[|\]]/g, ' ');

		return `[[${node.path.replace(/\.md$/, '')}#^${itemId}|${alias}]]`;
	});

	return [
		`## ${input.date} ${input.title.trim()}`,
		`id:: ${id}`,
		`status:: ${input.status ?? 'draft'}`,
		`items:: ${links.join(', ')}`,
		`source:: ${input.source.trim()}`,
		`ref:: ${input.ref.trim()}`,
		'',
		...input.body.map((line) => `- ${line.replace(/^[-*]\s+/, '').trim()}`),
	].join('\n');
}

function add(source: string): void {
	const raw = readFileSync(source === '-' ? 0 : source, 'utf8');
	const parsed: unknown = JSON.parse(raw);
	const inputs = (Array.isArray(parsed) ? parsed : [parsed]) as AddInput[];
	const vault = new Vault();
	const { config, db } = vault.load();
	const known = new Map(db.itemsById);
	const refs = new Set(db.entries.map((entry) => entry.fields['ref']?.trim()).filter(Boolean));
	const ids = new Set(db.entries.map((entry) => entry.id));

	const problems = inputs.flatMap((input, index) => validate(input, known).map((problem) => `entry ${index + 1}: ${problem}`));

	if (problems.length) {
		fail(`Nothing written.\n${problems.join('\n')}`);
	}

	for (const input of inputs) {
		if (refs.has(input.ref.trim())) {
			console.log(`Skipped (already logged): ${input.date} ${input.title}`);
			continue;
		}

		let id: string;

		do {
			id = `${input.date.replace(/-/g, '')}-${randomBytes(2).toString('hex')}`;
		} while (ids.has(id));

		ids.add(id);
		refs.add(input.ref.trim());

		const month = input.date.slice(0, 7);
		const path = vault.path(`${config.entriesFolder}/${month}.md`);

		if (!existsSync(path)) {
			mkdirSync(dirname(path), { recursive: true });
			appendFileSync(path, `# ${month}\n`);
		}

		appendFileSync(path, `\n${render(input, id, known)}\n`);
		console.log(`Added ${input.status ?? 'draft'} ${id}: ${input.date} ${input.title} → ${config.entriesFolder}/${month}.md`);
	}
}

/** Statements: items directly under a dimension file. Facets sit below them. */
function statements(root: Node): { statement: Node; parents: Map<string, Node> }[] {
	const result: { statement: Node; parents: Map<string, Node> }[] = [];

	walk(root, (node) => {
		if (node.kind !== 'group') {
			return;
		}

		for (const child of node.children.filter((child) => child.kind === 'item')) {
			const parents = new Map<string, Node>();
			walk(child, (descendant) => parents.set(descendant.key, child));
			result.push({ statement: child, parents });
		}
	});

	return result;
}

function leaves(node: Node): Node[] {
	return node.children.length ? node.children.flatMap(leaves) : [node];
}

function drafts(): void {
	const { db } = new Vault().load();
	const statementOf = new Map(statements(db.root).flatMap(({ statement, parents }) => [...parents.keys()].map((key) => [key, statement] as const)));
	const groups = new Map<string, string[]>();

	for (const entry of db.entries.filter((entry) => entry.status === 'draft')) {
		const first = entry.links.find((link) => link.id && statementOf.has(link.id));
		const statement = first?.id ? statementOf.get(first.id) : undefined;
		const heading = statement ? `${statement.trail.join(' › ')} › ${statement.label}` : 'Not linked to a known statement';
		const lines = [
			`- ${entry.id} | ${entry.date} ${entry.title}`,
			`  items: ${entry.links.map((link) => link.text).join(' · ')}`,
			...Object.entries(entry.fields)
				.filter(([key]) => !['id', 'status', 'items'].includes(key))
				.map(([key, value]) => `  ${key}: ${value}`),
			...entry.body.split('\n').map((line) => `  ${line}`),
		];

		groups.set(heading, [...(groups.get(heading) ?? []), ...lines]);
	}

	if (!groups.size) {
		console.log('No drafts.');
	}

	for (const [heading, lines] of groups) {
		console.log(`## ${heading}\n${lines.join('\n')}\n`);
	}
}

/** Lines of a collapsed callout, without the `> ` prefix. */
function calloutBody(text: string, title: RegExp): string[] {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => title.test(line));

	if (start === -1) {
		return [];
	}

	const end = lines.findIndex((line, index) => index > start && !line.startsWith('>'));

	return lines.slice(start + 1, end === -1 ? undefined : end).map((line) => line.replace(/^> ?/, ''));
}

/** Dimension question, dimension notes and the statement's own note, from the dimension file. */
function sheetNotes(vault: Vault, path: string, statementId: string): { question: string; dimension: string[]; statement: string } {
	const text = vault.read(path);
	const question = /^> \[!question\] (.*)$/m.exec(text)?.[1] ?? '';
	const notes = calloutBody(text, /^> \[!info\]-? Sheet notes/);
	const firstStatement = notes.findIndex((line) => /^\*\*Statement \d+:\*\*/.test(line));
	const dimension = (firstStatement === -1 ? notes : notes.slice(0, firstStatement)).filter((line) => line.trim());
	const position = /(\d+)$/.exec(statementId)?.[1];
	const own = notes.find((line) => line.startsWith(`**Statement ${position}:**`));

	return { question, dimension, statement: own?.replace(/^\*\*Statement \d+:\*\*\s*/, '') ?? '' };
}

function explain(ids: string[]): void {
	if (!ids.length) {
		fail('Usage: tracker explain <id…>');
	}

	const vault = new Vault();
	const { db } = vault.load();
	const statementOf = new Map(statements(db.root).flatMap(({ statement, parents }) => [...parents.keys()].map((key) => [key, statement] as const)));
	const unknown = ids.filter((id) => !statementOf.has(id));

	if (unknown.length) {
		fail(`Unknown item: ${unknown.join(', ')}`);
	}

	const asked = new Set(ids);
	const shown = new Set<string>();
	const shownFiles = new Set<string>();

	for (const id of ids) {
		const statement = statementOf.get(id)!;

		if (shown.has(statement.key)) {
			continue;
		}

		shown.add(statement.key);

		const notes = sheetNotes(vault, statement.path, statement.key);
		const mark = (node: Node) => (asked.has(node.key) ? ' <<' : '');

		console.log(`## ${statement.trail.join(' / ')}${notes.question ? `: ${notes.question}` : ''}`);
		console.log('');
		if (!shownFiles.has(statement.path)) {
			shownFiles.add(statement.path);
			console.log('Dimension notes:');
			console.log(notes.dimension.length ? notes.dimension.join('\n') : '(none)');
			console.log('');
		}

		console.log(`Statement ^${statement.key}${mark(statement)}: ${statement.label}`);
		console.log(`Statement note: ${notes.statement || '(none)'}`);

		if (statement.children.length) {
			console.log('Facets:');
			walk(statement, (node, depth) => depth > 0 && console.log(`${'  '.repeat(depth - 1)}- ^${node.key}${mark(node)} ${node.label} (${status(node)})`));
		} else {
			console.log(`Coverage: ${status(statement)}`);
		}

		console.log('');
	}

	const note = vault.notes.guidelines;
	const guidelines = existsSync(vault.path(note)) ? vault.read(note).split(/\r?\n/).filter((line) => line.startsWith('- ')) : [];
	console.log(`Rating guidelines (${note}):`);
	console.log(guidelines.length ? guidelines.join('\n') : '(none: run the import)');
}

function setStatus(id: string | undefined, status: string | undefined): void {
	if (!id || !(STATUSES as readonly string[]).includes(status ?? '')) {
		fail('Usage: tracker status <entry id> <draft|confirmed|rejected>');
	}

	const vault = new Vault();
	const { db } = vault.load();
	const entry = db.entries.find((candidate) => candidate.id === id) ?? fail(`No entry with ID ${id}.`);
	const path = vault.path(entry.path);

	writeFileSync(path, setEntryStatus(readFileSync(path, 'utf8'), id, status as Status));
	console.log(`${id}: ${entry.status} → ${status} (${entry.title})`);
}

/**
 * Statements to ask about in the review. Prefers statements with one facet
 * left, then statements without any evidence; skips focus statements (asked
 * about separately) and the ones in `recently-asked`, so questions rotate.
 */
function gaps(count: number): void {
	const vault = new Vault();
	const { db } = vault.load();
	const focus = vault.focusIds();
	const recent = new Set(vault.list('recently-asked'));

	const candidates = statements(db.root)
		.map(({ statement }) => {
			const all = leaves(statement).filter((leaf) => !leaf.retired);
			const missing = all.filter((leaf) => !leaf.covered);
			const rank = all.length > 1 && missing.length === 1 ? 0 : statement.confirmed + statement.drafts === 0 ? 1 : 2;

			return { statement, all, missing, rank };
		})
		.filter(({ statement, missing }) => missing.length && !statement.retired && !focus.has(statement.key) && !recent.has(statement.key))
		.sort((a, b) => a.rank - b.rank);

	// At most one statement per dimension, unless there aren't enough.
	const dimension = (node: Node) => node.trail.join(' › ');
	const picked = candidates.filter((candidate, index) => candidates.findIndex((other) => dimension(other.statement) === dimension(candidate.statement)) === index);
	const chosen = [...picked, ...candidates.filter((candidate) => !picked.includes(candidate))].slice(0, count);

	for (const { statement, all, missing } of chosen) {
		console.log(`${statement.key} | ${statement.trail.join(' › ')} › ${statement.label}`);

		for (const leaf of missing.filter((leaf) => leaf !== statement)) {
			console.log(`  missing: ${leaf.label}`);
		}

		console.log(`  ${all.length - missing.length} of ${all.length} covered`);
	}
}

/** Properties holding lists; everything else is a single value. */
const LIST_KEYS = ['focus', 'recently-asked'];

function config(key: string | undefined, values: string[]): void {
	const vault = new Vault();
	const note = vault.notes.config;

	if (!key) {
		console.log(JSON.stringify(vault.settings(), null, '\t'));
		return;
	}

	if (!values.length) {
		console.log(JSON.stringify(vault.settings()[key] ?? null));
		return;
	}

	const value = LIST_KEYS.includes(key) ? (values.length === 1 && values[0] === '[]' ? [] : values) : values.join(' ');

	vault.write(note, setProperty(vault.read(note), key, value));
	console.log(`${key} set.`);
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * When reviews happen, from Config.md:
 * - timezone: IANA name, default the system's
 * - review-days: e.g. "Mon Tue Wed Thu", default Mon–Fri
 * - review-hours: e.g. "10-16", default 9-17
 * - weekly: day and hour of the weekly part, e.g. "Thu 15", default "Fri 14"
 */
function schedule(vault: Vault) {
	const timezone = vault.setting('timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const days = (vault.setting('review-days') || 'Mon Tue Wed Thu Fri').split(/[\s,]+/).map((day) => WEEKDAYS.indexOf(day.slice(0, 3)) + 1).filter((day) => day > 0);
	const [from, to] = (vault.setting('review-hours') || '9-17').split('-').map(Number);
	const [weeklyDay, weeklyHour] = (vault.setting('weekly') || 'Fri 14').split(/\s+/);

	return { timezone, days, from, to, weeklyDay: WEEKDAYS.indexOf(weeklyDay.slice(0, 3)) + 1, weeklyHour: Number(weeklyHour ?? 0) };
}

/** Weekday (1 = Monday), hour and date of a moment in a timezone. */
function local(moment: Date, timeZone: string): { weekday: number; hour: number; date: string } {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
			.formatToParts(moment)
			.map((part) => [part.type, part.value]),
	);

	return {
		weekday: WEEKDAYS.indexOf(parts.weekday) + 1,
		hour: Number(parts.hour),
		date: `${parts.year}-${parts.month}-${parts.day}`,
	};
}

function reviewWindow(): void {
	const plan = schedule(new Vault());
	const now = local(new Date(), plan.timezone);
	const dayNames = plan.days.map((day) => WEEKDAYS[day - 1]).join(' ');

	if (!plan.days.includes(now.weekday)) {
		console.log(`closed: not a review day (${dayNames})`);
	} else if (now.hour < plan.from || now.hour >= plan.to) {
		console.log(`closed: outside ${plan.from}:00–${plan.to}:00 ${plan.timezone}`);
	} else {
		console.log('open');
	}
}

function health(): void {
	const vault = new Vault();
	const plan = schedule(vault);
	const problems: string[] = [];
	const now = new Date();
	const today = local(now, plan.timezone);

	// The weekly part is due on its day from its hour; find the most recent one.
	const daysBack = (today.weekday - plan.weeklyDay + 7) % 7 || (today.hour < plan.weeklyHour ? 7 : 0);
	const due = local(new Date(now.getTime() - daysBack * 86_400_000), plan.timezone).date;
	const weeklyAt = vault.setting('last-weekly-at');
	const weekly = weeklyAt ? local(new Date(weeklyAt), plan.timezone).date : null;

	if (!weekly || weekly < due) {
		problems.push(`weekly: not finished since ${WEEKDAYS[plan.weeklyDay - 1]} ${due} (last: ${weekly ?? 'never'})`);
	}

	if (vault.setting('last-mine-status').startsWith('failed')) {
		problems.push(`collect: ${vault.setting('last-mine-status')}`);
	}

	// Daily runs should keep last-mined-at within a working week or so.
	const minedThrough = vault.setting('last-mined-at');

	if (!minedThrough || now.getTime() - new Date(minedThrough).getTime() > 7 * 86_400_000) {
		problems.push(`collect: nothing collected since ${minedThrough ? minedThrough.slice(0, 10) : 'ever'}`);
	}

	// The backfill fills history up to a fixed date: where daily collection started.
	const backfilled = vault.setting('backfilled-through') || vault.setting('mining-start');
	const backfillUntil = vault.setting('backfill-until');

	if (backfilled && backfillUntil && new Date(backfilled) < new Date(backfillUntil)) {
		problems.push(`backfill: done through ${backfilled.slice(0, 10)}, needed up to ${backfillUntil.slice(0, 10)}`);
	}

	console.log(problems.length ? problems.join('\n') : 'OK');
}

const OVERVIEW = (folder: string) => `---
reviewed-db: Matrix Reloaded evidence
items-folder: ${folder}/Statements
entries-folder: ${folder}/Evidence
coverage: all
order: []
---

\`\`\`reviewed-db
\`\`\`

A statement is covered when every facet has at least one confirmed piece of evidence. Statements without facets need one confirmed piece themselves.
`;

const CONFIG = `---
base-profile:
growth-profile:
timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
review-days: Mon Tue Wed Thu Fri
review-hours: 9-17
weekly: Fri 14
focus: []
recently-asked: []
---

# Config

Settings for the evidence tracker. Claude maintains most of them; edit the ones marked as yours.

- **base-profile / growth-profile** (yours): sheet names exactly as in the Matrix Reloaded sheet in \`Source/\`, e.g. \`Expert - core (7)\`. Culture is always included. After changing them, ask Claude to re-run the import.
- **timezone, review-days, review-hours, weekly** (yours): when scheduled reviews may run, and when the weekly part is due (day and hour).
- **focus** (yours): statements to work on this period. Ask Claude to set them.
- **last-mined-at, last-mine-status**: how far scheduled runs have collected activity, and whether the last run worked.
- **mining-start, backfill-until, backfilled-through**: the optional backfill of older history.
- **last-review-at / last-weekly-at**: when the review and the weekly part last finished.
- **recently-asked**: statements the last weekly parts asked about, so questions rotate.
- Sources and routine: see \`Routine.md\`.
`;

function init(args: string[]): void {
	const option = (name: string) => {
		const index = args.indexOf(`--${name}`);

		return index >= 0 ? args[index + 1] : undefined;
	};
	const vaultPath = option('vault') ?? fail('Usage: tracker init --vault <absolute path> [--folder <name>]');
	const folder = option('folder') ?? 'Matrix Reloaded';
	const root = isAbsolute(vaultPath) ? vaultPath : resolve(vaultPath);

	if (!existsSync(join(root, '.obsidian'))) {
		fail(`${root} is not an Obsidian vault (no .obsidian folder).`);
	}

	const paths = notes(folder);

	for (const dir of [paths.statements, paths.evidence, paths.source]) {
		mkdirSync(join(root, dir), { recursive: true });
	}

	for (const [note, text] of [
		[paths.database, OVERVIEW(folder)],
		[paths.config, CONFIG],
	]) {
		if (existsSync(join(root, note))) {
			console.log(`Kept existing ${note}`);
		} else {
			writeFileSync(join(root, note), text);
			console.log(`Created ${note}`);
		}
	}

	writeFileSync(SETTINGS_FILE, `${JSON.stringify({ vault: root, folder }, null, '\t')}\n`);
	console.log(`Saved the location in ${SETTINGS_FILE}`);
}

function where(): void {
	const vault = new Vault();
	console.log(JSON.stringify({ vault: vault.root, folder: vault.folder, ...vault.notes }, null, '\t'));
}

const [command, argument, ...rest] = process.argv.slice(2);

switch (command) {
	case 'items':
		items(argument === '--json');
		break;
	case 'add':
		add(argument ?? fail('Usage: tracker add <file.json|->'));
		break;
	case 'check':
		check();
		break;
	case 'drafts':
		drafts();
		break;
	case 'status':
		setStatus(argument, rest[0]);
		break;
	case 'explain':
		explain([argument, ...rest].filter(Boolean) as string[]);
		break;
	case 'gaps':
		gaps(Number(argument ?? 3));
		break;
	case 'config':
		config(argument, rest);
		break;
	case 'window':
		reviewWindow();
		break;
	case 'init':
		init([argument, ...rest].filter(Boolean) as string[]);
		break;
	case 'where':
		where();
		break;
	case 'health':
		health();
		break;
	default:
		fail('Usage: tracker init --vault <path> [--folder <name>] | where | items [--json] | add <file.json|-> | check | drafts | status <id> <status> | explain <id…> | gaps [count] | config [key [value…]] | window | health');
}
