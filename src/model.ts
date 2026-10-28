// Parser and coverage logic for the format in docs/format.md.
// Pure TypeScript with erasable syntax only: no Obsidian or Node imports,
// so Node scripts can import this file directly.

export const STATUSES = ['draft', 'confirmed', 'rejected'] as const;
export type Status = (typeof STATUSES)[number];

export const FILTERS = ['all', 'missing', 'drafts'] as const;
export type Filter = (typeof FILTERS)[number];

export interface DbConfig {
	name: string;
	itemsFolder: string;
	entriesFolder: string;
	coverage: 'all' | 'any';
	order: string[];
}

export interface SourceFile {
	path: string;
	text: string;
}

export interface Item {
	id: string;
	text: string;
	textChanged: boolean;
	retired: boolean;
	line: number;
	children: Item[];
}

export interface Link {
	/** Link target without the `#^id` part, e.g. a file name. */
	target: string;
	/** Block ID, or null when the link has no `#^id` part. */
	id: string | null;
	/** Alias, or the link target without the `#^id` part. */
	text: string;
}

export interface Entry {
	id: string;
	date: string;
	title: string;
	/** Raw value; not necessarily a valid Status. */
	status: string;
	links: Link[];
	fields: Record<string, string>;
	/** Lines that are not fields, trimmed. */
	body: string;
	path: string;
	/** 0-based line of the heading. */
	line: number;
	/** 0-based line after the entry. */
	end: number;
}

export interface Node {
	/** Stable across rebuilds: folder or file path, or block ID. */
	key: string;
	kind: 'group' | 'item';
	label: string;
	/** Labels of the ancestors, outermost first, without the database. */
	trail: string[];
	path: string;
	line: number;
	textChanged: boolean;
	/** Tagged #retired, or inside a retired item. Kept out of coverage. */
	retired: boolean;
	children: Node[];
	/** Entries linked directly to this item, any status. */
	entries: Entry[];
	covered: boolean;
	/** Distinct entries in this subtree. */
	confirmed: number;
	drafts: number;
}

export type WarningKind =
	| 'Broken link'
	| 'Text changed'
	| 'Duplicate ID'
	| 'Invalid status'
	| 'Missing ID'
	| 'No items'
	| 'Unresolved link';

export interface Warning {
	kind: WarningKind;
	message: string;
	path: string;
	line: number;
}

export interface Db {
	root: Node;
	/** Outermost retired items, taken out of the tree with their children. */
	retired: Node[];
	itemsById: Map<string, Node>;
	/** All entries, in file and line order. */
	entries: Entry[];
	warnings: Warning[];
	/** Items without children. */
	leaves: { covered: number; total: number };
}

export function parseConfig(frontmatter: Record<string, unknown> | undefined): DbConfig {
	const fm = frontmatter ?? {};
	const dbName = fm['reviewed-db'];

	if (dbName === undefined || dbName === null) {
		throw new Error('Note has no reviewed-db property.');
	}

	const folder = (key: string): string => {
		const value = fm[key];

		if (typeof value !== 'string' || !value.trim()) {
			throw new Error(`Property ${key} is missing or empty.`);
		}

		return value.trim().replace(/^\/+|\/+$/g, '');
	};

	const coverage = fm['coverage'] ?? 'all';

	if (coverage !== 'all' && coverage !== 'any') {
		throw new Error(`Property coverage must be all or any, not ${String(coverage)}.`);
	}

	const order = fm['order'] ?? [];

	if (!Array.isArray(order)) {
		throw new Error('Property order must be a list.');
	}

	return {
		name: String(dbName),
		itemsFolder: folder('items-folder'),
		entriesFolder: folder('entries-folder'),
		coverage,
		order: order.map(String),
	};
}

/** Block parameters `key: value`, one per line. */
export function parseBlockParams(source: string): Record<string, string> {
	const params: Record<string, string> = {};

	for (const line of source.split('\n')) {
		const match = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(line);

		if (match) {
			params[match[1].toLowerCase()] = match[2];
		}
	}

	return params;
}

interface Line {
	line: number;
	text: string;
	/** A code fence marker or a line inside a fence. */
	code: boolean;
}

/** Lines after the frontmatter, if any, with 0-based line numbers. */
function contentLines(text: string, frontmatter = true): Line[] {
	const lines = text.split(/\r?\n/);
	const result: Line[] = [];
	let start = 0;

	if (frontmatter && lines[0] === '---') {
		const end = lines.indexOf('---', 1);
		start = end === -1 ? 0 : end + 1;
	}

	let fence: string | null = null;

	for (let i = start; i < lines.length; i++) {
		const marker = /^\s*(`{3,}|~{3,})/.exec(lines[i])?.[1];
		const isMarker = marker !== undefined && (fence === null || marker.startsWith(fence));

		result.push({ line: i, text: lines[i], code: isMarker || fence !== null });

		if (isMarker) {
			fence = fence === null ? marker : null;
		}
	}

	return result;
}

export function frontmatterTitle(text: string): string | null {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	const title = match && /^title:[ \t]*(.+?)[ \t]*$/m.exec(match[1])?.[1];

	return title ? title.replace(/^(['"])(.*)\1$/, '$2') : null;
}

const LIST_ITEM = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+(.*)$/;
const BLOCK_ID = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/;

function hasTag(text: string, tag: string): boolean {
	return new RegExp(`(^|\\s)#${tag}(\\s|$)`).test(text);
}

function indentWidth(indent: string): number {
	return indent.replace(/\t/g, '    ').length;
}

/** Top-level items of one item file, with their nested children. */
export function parseItems(text: string): Item[] {
	const roots: Item[] = [];
	const stack: { indent: number; item: Item | null }[] = [];

	for (const { line, text: content } of contentLines(text).filter((l) => !l.code)) {
		const match = LIST_ITEM.exec(content);

		if (!match) {
			// A non-indented, non-blank line ends the list.
			if (content.trim() && !/^[ \t]/.test(content)) {
				stack.length = 0;
			}

			continue;
		}

		const indent = indentWidth(match[1]);

		while (stack.length && stack[stack.length - 1].indent >= indent) {
			stack.pop();
		}

		const id = BLOCK_ID.exec(match[2])?.[1];
		let item: Item | null = null;

		if (id) {
			const body = match[2].replace(BLOCK_ID, '');
			item = {
				id,
				text: body.replace(/(^|\s)#(text-changed|retired)(?=\s|$)/g, '$1').replace(/\s+/g, ' ').trim(),
				textChanged: hasTag(body, 'text-changed'),
				retired: hasTag(body, 'retired'),
				line,
				children: [],
			};

			const parent = [...stack].reverse().find((s) => s.item)?.item;
			(parent ? parent.children : roots).push(item);
		}

		stack.push({ indent, item });
	}

	return roots;
}

const ENTRY_HEADING = /^##[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const OTHER_HEADING = /^#[ \t]/;
const FIELD = /^[ \t]*(?:[-*+][ \t]+)?([A-Za-z][\w-]*)::[ \t]*(.*?)[ \t]*$/;
const WIKILINK = /\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g;

export function parseEntries(path: string, text: string): Entry[] {
	const entries: Entry[] = [];
	let current: Entry | null = null;

	const lines = contentLines(text);

	for (const { line, text: content, code } of lines) {
		if (code) {
			if (current) current.body += `${content}\n`;
			continue;
		}

		const heading = ENTRY_HEADING.exec(content);

		if (current && (heading || OTHER_HEADING.test(content))) {
			current.end = line;
		}

		if (heading) {
			const dated = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/.exec(heading[1]);
			current = {
				id: '',
				date: dated?.[1] ?? '',
				title: dated?.[2] ?? heading[1],
				status: '',
				links: [],
				fields: {},
				body: '',
				path,
				line,
				end: line + 1,
			};
			entries.push(current);
			continue;
		}

		if (OTHER_HEADING.test(content)) {
			current = null;
			continue;
		}

		const field = current && FIELD.exec(content);

		if (current && !field) {
			current.body += `${content}\n`;
		}

		if (!current || !field) {
			continue;
		}

		const key = field[1].toLowerCase();
		const value = field[2];
		current.fields[key] = current.fields[key] ? `${current.fields[key]}, ${value}` : value;

		if (key === 'items') {
			for (const link of value.matchAll(WIKILINK)) {
				const [target, blockId] = link[1].split('#^');
				current.links.push({ target, id: blockId ?? null, text: link[2] ?? target });
			}
		}
	}

	if (current) {
		current.end = (lines.at(-1)?.line ?? 0) + 1;
	}

	for (const entry of entries) {
		entry.id = entry.fields['id'] ?? '';
		entry.status = (entry.fields['status'] ?? '').toLowerCase();
		entry.body = entry.body.trim();
	}

	return entries;
}

export interface EntryInput {
	id: string;
	date: string;
	title: string;
	status: Status;
	links: Link[];
	/** Fields other than id, status and items, kept as they are. */
	fields: Record<string, string>;
	body: string;
}

const BASE_FIELDS = ['id', 'status', 'items'];

export function entryInput(entry: Entry): EntryInput {
	const fields = Object.fromEntries(Object.entries(entry.fields).filter(([key]) => !BASE_FIELDS.includes(key)));
	const status = (STATUSES as readonly string[]).includes(entry.status) ? (entry.status as Status) : 'draft';

	return { id: entry.id, date: entry.date, title: entry.title, status, links: entry.links, fields, body: entry.body };
}

/** One line of plain text, safe inside a heading, field or link alias. */
function inline(text: string, unsafe = /[\r\n]+/g): string {
	return text.replace(unsafe, ' ').replace(/\s+/g, ' ').trim();
}

export function formatLink(link: Link): string {
	const target = link.id === null ? link.target : `${link.target}#^${link.id}`;

	return `[[${target}|${inline(link.text, /[\r\n|[\]]+/g)}]]`;
}

/**
 * Escape body lines that would otherwise end the entry (headings) or read as
 * fields (`key::`). Lines inside code fences stay as they are.
 */
function escapeBody(body: string): string {
	return contentLines(body, false)
		.map(({ text, code }) => {
			if (code) return text;
			if (/^#{1,2}[ \t]/.test(text)) return `\\${text}`;

			return FIELD.test(text) ? text.replace('::', '\\::') : text;
		})
		.join('\n');
}

/** The entry as Markdown, without a trailing newline. */
export function formatEntry(entry: EntryInput): string {
	const lines = [
		`## ${inline(`${entry.date} ${entry.title}`)}`,
		`id:: ${inline(entry.id)}`,
		`status:: ${entry.status}`,
		`items:: ${entry.links.map(formatLink).join(', ')}`,
		...Object.entries(entry.fields).map(([key, value]) => `${key}:: ${inline(value)}`),
	];
	const body = entry.body.trim();

	return body ? `${lines.join('\n')}\n\n${escapeBody(body)}` : lines.join('\n');
}

/** The one entry with this ID in a file's text; throws when there is none or more than one. */
function findEntry(text: string, id: string): Entry {
	const matches = parseEntries('', text).filter((entry) => entry.id === id);

	if (matches.length !== 1) {
		throw new Error(matches.length ? `Entry ID ${id} is used more than once in this file.` : `No entry with ID ${id} in this file.`);
	}

	return matches[0];
}

/** Rewrite only the status line of one entry. */
export function setEntryStatus(text: string, id: string, status: Status): string {
	const entry = findEntry(text, id);
	const lines = text.split('\n');
	const statusLine = /^([ \t]*(?:[-*+][ \t]+)?status::[ \t]*).*?(\r?)$/i;

	for (let i = entry.line + 1; i < entry.end; i++) {
		if (statusLine.test(lines[i])) {
			lines[i] = lines[i].replace(statusLine, `$1${status}$2`);
			return lines.join('\n');
		}
	}

	lines.splice(entry.line + 1, 0, `status:: ${status}`);

	return lines.join('\n');
}

/** Replace one entry with new content. Blank lines after it stay. */
export function replaceEntry(text: string, id: string, input: EntryInput): string {
	const entry = findEntry(text, id);
	const lines = text.split('\n');
	let end = entry.end;

	while (end > entry.line + 1 && !lines[end - 1].trim()) {
		end--;
	}

	lines.splice(entry.line, end - entry.line, formatEntry(input));

	return lines.join('\n');
}

/** Add an entry at the end of a log file. */
export function appendEntry(text: string, input: EntryInput): string {
	const trimmed = text.replace(/\s+$/, '');

	return `${trimmed}${trimmed ? '\n\n' : ''}${formatEntry(input)}\n`;
}

/** Remove the `#text-changed` tag from the item with this block ID. */
export function clearTextChanged(text: string, id: string): string {
	const item = contentLines(text).find(({ text: content, code }) => !code && LIST_ITEM.test(content) && BLOCK_ID.exec(content)?.[1] === id);

	if (!item) {
		throw new Error(`No item with ID ${id} in this file.`);
	}

	const lines = text.split('\n');
	lines[item.line] = lines[item.line].replace(/[ \t]#text-changed(?=[ \t\r]|$)/g, '');

	return lines.join('\n');
}

/** Set the text of every `items::` link to this item to `label`. Body text stays as it is. */
export function relabelLinks(text: string, id: string, label: string): string {
	const lines = text.split('\n');

	for (const { line, text: content, code } of contentLines(text)) {
		if (code || FIELD.exec(content)?.[1].toLowerCase() !== 'items') {
			continue;
		}

		lines[line] = lines[line].replace(WIKILINK, (link, target: string) => {
			const [file, blockId] = target.split('#^');
			return blockId === id ? formatLink({ target: file, id, text: label }) : link;
		});
	}

	return lines.join('\n');
}

/** `YYYYMMDD-` plus 4 hex characters, not in `taken`. */
export function newEntryId(date: string, taken: Set<string>, random: () => number = Math.random): string {
	const prefix = date.replace(/-/g, '');

	for (;;) {
		const id = `${prefix}-${Math.floor(random() * 0x10000).toString(16).padStart(4, '0')}`;

		if (!taken.has(id)) {
			return id;
		}
	}
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function inFolder(path: string, folder: string): boolean {
	return path.startsWith(`${folder}/`);
}

export function isDbFile(config: DbConfig, path: string): boolean {
	return inFolder(path, config.itemsFolder) || inFolder(path, config.entriesFolder);
}

function newNode(key: string, kind: Node['kind'], label: string, path: string, line = 0): Node {
	return { key, kind, label, trail: [], path, line, textChanged: false, retired: false, children: [], entries: [], covered: false, confirmed: 0, drafts: 0 };
}

/**
 * Build the merged tree. Pass every Markdown file of the vault (or of both
 * folders); files outside the configured folders are ignored.
 */
export function buildDb(config: DbConfig, files: SourceFile[]): Db {
	const warnings: Warning[] = [];
	const root = newNode('', 'group', config.name, '');
	const groups = new Map<string, Node>([['', root]]);
	const itemsById = new Map<string, Node>();

	const group = (folder: string): Node => {
		const existing = groups.get(folder);

		if (existing) {
			return existing;
		}

		const slash = folder.lastIndexOf('/');
		const node = newNode(folder, 'group', folder.slice(slash + 1), folder);
		group(slash === -1 ? '' : folder.slice(0, slash)).children.push(node);
		groups.set(folder, node);

		return node;
	};

	const addItems = (parent: Node, items: Item[], path: string): void => {
		for (const item of items) {
			const node = newNode(item.id, 'item', item.text, path, item.line);
			node.textChanged = item.textChanged;
			node.retired = parent.retired || item.retired;
			parent.children.push(node);

			const first = itemsById.get(item.id);

			if (first) {
				const message = `"${item.text}" (${parent.label}) has the same ID as "${first.label}"`;
				warnings.push({ kind: 'Duplicate ID', message, path, line: item.line });
			} else {
				itemsById.set(item.id, node);
			}

			if (item.textChanged && !node.retired) {
				warnings.push({ kind: 'Text changed', message: `"${item.text}" (${parent.label})`, path, line: item.line });
			}

			addItems(node, item.children, path);
		}
	};

	const entryFiles: SourceFile[] = [];

	for (const file of files) {
		if (!file.path.endsWith('.md')) {
			continue;
		}

		if (inFolder(file.path, config.entriesFolder)) {
			entryFiles.push(file);
			continue;
		}

		if (!inFolder(file.path, config.itemsFolder)) {
			continue;
		}

		const relative = file.path.slice(config.itemsFolder.length + 1);
		const slash = relative.lastIndexOf('/');
		const parent = group(slash === -1 ? '' : relative.slice(0, slash));
		const basename = relative.slice(slash + 1, -'.md'.length);
		const fileNode = newNode(file.path, 'group', frontmatterTitle(file.text) ?? basename, file.path);
		parent.children.push(fileNode);
		addItems(fileNode, parseItems(file.text), file.path);
	}

	// Group keys are relative to the items folder; make them vault paths.
	for (const [folder, node] of groups) {
		node.path = node.key = folder ? `${config.itemsFolder}/${folder}` : config.itemsFolder;
	}

	const entries = attachEntries(entryFiles, itemsById, warnings);

	const rank = (node: Node): number => {
		const index = config.order.findIndex((name) => name === node.label || node.path.endsWith(`/${name}.md`));
		return index === -1 ? config.order.length : index;
	};

	// Folders and files sort by `order`, then by name. Items keep their order in the file.
	const sortGroups = (node: Node): void => {
		if (node.kind === 'item' || node.path.endsWith('.md')) {
			return;
		}

		node.children.sort((a, b) => rank(a) - rank(b) || collator.compare(a.label, b.label));
		node.children.forEach(sortGroups);
	};

	setTrails(root, null);
	sortGroups(root);
	const retired = extractRetired(root);
	prune(root);
	finish(root, config.coverage);
	retired.forEach((node) => finish(node, config.coverage));

	return { root, retired, itemsById, entries, warnings, leaves: countLeaves(root) };
}

export function entryName(entry: Entry): string {
	return `${entry.date} ${entry.title}`.trim() || 'Untitled entry';
}

function attachEntries(files: SourceFile[], itemsById: Map<string, Node>, warnings: Warning[]): Entry[] {
	const entries: Entry[] = [];
	const byId = new Map<string, Entry>();

	for (const file of files) {
		for (const entry of parseEntries(file.path, file.text)) {
			const where = { path: entry.path, line: entry.line };
			const name = entryName(entry);
			const first = byId.get(entry.id);
			entries.push(entry);

			if (!entry.id) {
				warnings.push({ kind: 'Missing ID', message: `${name} has no id`, ...where });
			} else if (first) {
				warnings.push({ kind: 'Duplicate ID', message: `${name} has the same id as ${entryName(first)}`, ...where });
			} else {
				byId.set(entry.id, entry);
			}

			if (!(STATUSES as readonly string[]).includes(entry.status)) {
				const status = entry.status ? `status "${entry.status}"` : 'no status';
				warnings.push({ kind: 'Invalid status', message: `${name} has ${status}`, ...where });
			}

			if (!entry.links.length) {
				warnings.push({ kind: 'No items', message: `${name} links to no items`, ...where });
			}

			for (const link of entry.links) {
				const node = link.id === null ? undefined : itemsById.get(link.id);

				if (link.id === null) {
					warnings.push({ kind: 'Unresolved link', message: `${name} links to "${link.text}", which is not an item`, ...where });
				} else if (!node) {
					warnings.push({ kind: 'Broken link', message: `${name} links to "${link.text}", which no longer exists`, ...where });
				} else if (!node.entries.includes(entry)) {
					node.entries.push(entry);
				}
			}
		}
	}

	return entries;
}

/** Drop groups without items. Returns whether the node stays. */
function prune(node: Node): boolean {
	node.children = node.children.filter((child) => child.kind === 'item' || prune(child));

	return node.children.length > 0;
}

/** The root (trail null) stays out of its descendants' trails. */
function setTrails(node: Node, trail: string[] | null): void {
	node.trail = trail ?? [];
	const childTrail = trail === null ? [] : [...trail, node.label];
	node.children.forEach((child) => setTrails(child, childTrail));
}

/** Remove the outermost retired items from the tree and return them. */
function extractRetired(node: Node): Node[] {
	const retired = node.children.filter((child) => child.retired);
	node.children = node.children.filter((child) => !child.retired);

	return [...retired, ...node.children.flatMap(extractRetired)];
}

/** Fill covered and counts. Returns the distinct entries in the subtree. */
function finish(node: Node, rule: DbConfig['coverage']): Set<Entry> {
	const subtree = new Set(node.entries);

	for (const child of node.children) {
		finish(child, rule).forEach((entry) => subtree.add(entry));
	}

	for (const entry of subtree) {
		if (entry.status === 'confirmed') node.confirmed++;
		if (entry.status === 'draft') node.drafts++;
	}

	if (node.children.length === 0) {
		node.covered = node.entries.some((entry) => entry.status === 'confirmed');
	} else if (rule === 'all') {
		node.covered = node.children.every((child) => child.covered);
	} else {
		node.covered = node.children.some((child) => child.covered);
	}

	return subtree;
}

function countLeaves(node: Node): Db['leaves'] {
	if (node.children.length === 0) {
		return { covered: node.covered ? 1 : 0, total: node.kind === 'item' ? 1 : 0 };
	}

	return node.children.map(countLeaves).reduce((a, b) => ({ covered: a.covered + b.covered, total: a.total + b.total }));
}

/** Whether a node passes the filter. */
export function matches(node: Node, filter: Filter): boolean {
	if (filter === 'missing') return !node.covered;
	if (filter === 'drafts') return node.drafts > 0;

	return true;
}
