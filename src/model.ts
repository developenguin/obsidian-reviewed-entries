// Parser and coverage logic for the format in docs/format.md.
// Pure TypeScript with erasable syntax only: no Obsidian or Node imports,
// so Node scripts can import this file directly.

export const STATUSES = ['draft', 'confirmed', 'rejected'] as const;
export type Status = (typeof STATUSES)[number];

export const FILTERS = ['all', 'missing', 'drafts'] as const;
export type Filter = (typeof FILTERS)[number];

export const TEXT_CHANGED_TAG = '#text-changed';

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
	line: number;
	children: Item[];
}

export interface Link {
	/** Block ID, or null when the link has no `#^id` part. */
	id: string | null;
	raw: string;
}

export interface Entry {
	id: string;
	date: string;
	title: string;
	/** Raw value; not necessarily a valid Status. */
	status: string;
	links: Link[];
	fields: Record<string, string>;
	path: string;
	line: number;
}

export interface Node {
	/** Stable across rebuilds: folder or file path, or block ID. */
	key: string;
	kind: 'group' | 'item';
	label: string;
	path: string;
	line: number;
	textChanged: boolean;
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

/** Lines outside frontmatter and code fences, with 0-based line numbers. */
function contentLines(text: string): { line: number; text: string }[] {
	const lines = text.split(/\r?\n/);
	const result: { line: number; text: string }[] = [];
	let start = 0;

	if (lines[0] === '---') {
		const end = lines.indexOf('---', 1);
		start = end === -1 ? 0 : end + 1;
	}

	let fence: string | null = null;

	for (let i = start; i < lines.length; i++) {
		const marker = /^\s*(`{3,}|~{3,})/.exec(lines[i])?.[1];

		if (marker && (fence === null || marker.startsWith(fence))) {
			fence = fence === null ? marker : null;
			continue;
		}

		if (fence === null) {
			result.push({ line: i, text: lines[i] });
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

function indentWidth(indent: string): number {
	return indent.replace(/\t/g, '    ').length;
}

/** Top-level items of one item file, with their nested children. */
export function parseItems(text: string): Item[] {
	const roots: Item[] = [];
	const stack: { indent: number; item: Item | null }[] = [];

	for (const { line, text: content } of contentLines(text)) {
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
				text: body.replace(/(^|\s)#text-changed(?=\s|$)/g, '$1').replace(/\s+/g, ' ').trim(),
				textChanged: /(^|\s)#text-changed(\s|$)/.test(body),
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
const WIKILINK = /\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g;

export function parseEntries(path: string, text: string): Entry[] {
	const entries: Entry[] = [];
	let current: Entry | null = null;

	for (const { line, text: content } of contentLines(text)) {
		const heading = ENTRY_HEADING.exec(content);

		if (heading) {
			const dated = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/.exec(heading[1]);
			current = {
				id: '',
				date: dated?.[1] ?? '',
				title: dated?.[2] ?? heading[1],
				status: '',
				links: [],
				fields: {},
				path,
				line,
			};
			entries.push(current);
			continue;
		}

		if (OTHER_HEADING.test(content)) {
			current = null;
			continue;
		}

		const field = current && FIELD.exec(content);

		if (!current || !field) {
			continue;
		}

		const key = field[1].toLowerCase();
		const value = field[2];
		current.fields[key] = current.fields[key] ? `${current.fields[key]}, ${value}` : value;

		if (key === 'items') {
			for (const link of value.matchAll(WIKILINK)) {
				current.links.push({ id: /#\^([A-Za-z0-9-]+)$/.exec(link[1])?.[1] ?? null, raw: link[0] });
			}
		}
	}

	for (const entry of entries) {
		entry.id = entry.fields['id'] ?? '';
		entry.status = (entry.fields['status'] ?? '').toLowerCase();
	}

	return entries;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function inFolder(path: string, folder: string): boolean {
	return path.startsWith(`${folder}/`);
}

export function isDbFile(config: DbConfig, path: string): boolean {
	return inFolder(path, config.itemsFolder) || inFolder(path, config.entriesFolder);
}

function newNode(key: string, kind: Node['kind'], label: string, path: string, line = 0): Node {
	return { key, kind, label, path, line, textChanged: false, children: [], entries: [], covered: false, confirmed: 0, drafts: 0 };
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
			parent.children.push(node);

			if (itemsById.has(item.id)) {
				warnings.push({ kind: 'Duplicate ID', message: `Item ID ^${item.id} is used more than once.`, path, line: item.line });
			} else {
				itemsById.set(item.id, node);
			}

			if (item.textChanged) {
				warnings.push({ kind: 'Text changed', message: `Item text changed: ${item.text}`, path, line: item.line });
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

	attachEntries(entryFiles, itemsById, warnings);

	const rank = (node: Node): number => {
		const index = config.order.findIndex((name) => name === node.label || node.path.endsWith(`/${name}.md`));
		return index === -1 ? config.order.length : index;
	};

	const sortGroups = (node: Node): void => {
		if (node.kind === 'item') {
			return;
		}

		node.children.sort((a, b) => rank(a) - rank(b) || collator.compare(a.label, b.label));
		node.children.forEach(sortGroups);
	};

	prune(root);
	sortGroups(root);
	finish(root, config.coverage);

	return { root, warnings, leaves: countLeaves(root) };
}

function attachEntries(files: SourceFile[], itemsById: Map<string, Node>, warnings: Warning[]): void {
	const seenIds = new Set<string>();

	for (const file of files) {
		for (const entry of parseEntries(file.path, file.text)) {
			const where = { path: entry.path, line: entry.line };
			const name = entry.title || entry.date || 'Untitled entry';

			if (!entry.id) {
				warnings.push({ kind: 'Missing ID', message: `Entry has no id: ${name}`, ...where });
			} else if (seenIds.has(entry.id)) {
				warnings.push({ kind: 'Duplicate ID', message: `Entry ID ${entry.id} is used more than once: ${name}`, ...where });
			}

			seenIds.add(entry.id);

			if (!(STATUSES as readonly string[]).includes(entry.status)) {
				const status = entry.status ? `status "${entry.status}"` : 'no status';
				warnings.push({ kind: 'Invalid status', message: `Entry has ${status}: ${name}`, ...where });
			}

			if (!entry.links.length) {
				warnings.push({ kind: 'No items', message: `Entry links to no items: ${name}`, ...where });
			}

			for (const link of entry.links) {
				const node = link.id === null ? undefined : itemsById.get(link.id);

				if (link.id === null) {
					warnings.push({ kind: 'Unresolved link', message: `Link has no block ID: ${link.raw} in ${name}`, ...where });
				} else if (!node) {
					warnings.push({ kind: 'Broken link', message: `No item with ID ^${link.id}: ${link.raw} in ${name}`, ...where });
				} else if (!node.entries.includes(entry)) {
					node.entries.push(entry);
				}
			}
		}
	}
}

/** Drop groups without items. Returns whether the node stays. */
function prune(node: Node): boolean {
	node.children = node.children.filter((child) => child.kind === 'item' || prune(child));

	return node.children.length > 0;
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
