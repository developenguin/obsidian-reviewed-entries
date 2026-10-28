// Renders a Db into plain DOM. No Obsidian imports, so a browser page can
// preview it; main.ts supplies navigation and Markdown rendering.

import { type Db, type Entry, type Filter, type Node, FILTERS, matches } from './model';

export const VIEWS = ['overview', 'inbox'] as const;
export type View = (typeof VIEWS)[number];

export interface ViewState {
	filter: Filter;
	/** Open state per node key, set when the user toggles a row. */
	open: Map<string, boolean>;
}

export interface ViewHandlers {
	/** Open a file at a 0-based line; `event` tells whether to use a new tab. */
	openLine(path: string, line: number, event: MouseEvent): void;
	/** Render Markdown into `el`. Without it, text is shown as-is. */
	renderMarkdown?(el: HTMLElement, markdown: string): void;
}

const FILTER_LABELS: Record<Filter, string> = {
	all: 'All',
	missing: 'Missing only',
	drafts: 'Drafts only',
};

const STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	confirmed: 'Confirmed',
	rejected: 'Rejected',
};

// Fields every entry has; the inbox shows the others.
const BASE_FIELDS = ['id', 'status', 'items'];

// Rows deeper than this start collapsed.
const OPEN_DEPTH = 2;

let instance = 0;

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	cls?: string,
	text?: string,
	parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag);

	if (cls) element.className = cls;
	if (text !== undefined) element.textContent = text;
	parent?.appendChild(element);

	return element;
}

function link(parent: HTMLElement, text: string, path: string, line: number, handlers: ViewHandlers): HTMLAnchorElement {
	const a = el('a', 'rdb-link', text, parent);
	a.href = '#';
	a.addEventListener('click', (event) => {
		event.preventDefault();
		handlers.openLine(path, line, event);
	});

	return a;
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

/** Confirmed entries count as entries; drafts are listed apart. */
function counts(node: Node): string {
	const parts = [];

	if (node.confirmed) parts.push(plural(node.confirmed, 'entry', 'entries'));
	if (node.drafts) parts.push(plural(node.drafts, 'draft', 'drafts'));

	return parts.join(' · ');
}

export function renderError(container: HTMLElement, message: string): void {
	container.replaceChildren();
	el('p', 'rdb-error', `Reviewed Entries: ${message}`, container);
}

export function renderDb(container: HTMLElement, db: Db, state: ViewState, handlers: ViewHandlers): void {
	container.replaceChildren();
	const root = el('div', 'rdb', undefined, container);
	const missing = db.leaves.total - db.leaves.covered;

	el('div', 'rdb-title', db.root.label, root);
	el('p', 'rdb-summary', `${missing} of ${db.leaves.total} lowest-level items missing. ${counts(db.root) || 'No entries yet'}.`, root);

	renderFilter(root, state, () => renderDb(container, db, state, handlers));

	if (db.warnings.length) {
		const details = el('details', 'rdb-warnings', undefined, root);
		details.open = true;
		el('summary', undefined, `Warnings (${db.warnings.length})`, details);
		const list = el('ul', undefined, undefined, details);

		for (const warning of db.warnings) {
			const li = el('li', undefined, undefined, list);
			el('strong', undefined, `${warning.kind}: `, li);
			link(li, warning.message, warning.path, warning.line, handlers);
		}
	}

	const visible = db.root.children.filter((child) => matches(child, state.filter));

	if (!visible.length) {
		el('p', 'rdb-empty', db.root.children.length ? 'Nothing matches this filter.' : 'No items found.', root);
		return;
	}

	const tree = el('ul', 'rdb-tree', undefined, root);
	visible.forEach((child) => renderNode(tree, child, 1, state, handlers));
}

function renderFilter(parent: HTMLElement, state: ViewState, rerender: () => void): void {
	const fieldset = el('fieldset', 'rdb-filter', undefined, parent);
	el('legend', undefined, 'Show', fieldset);
	const name = `rdb-filter-${instance++}`;

	for (const filter of FILTERS) {
		const label = el('label', undefined, undefined, fieldset);
		const input = el('input', undefined, undefined, label);
		input.type = 'radio';
		input.name = name;
		input.value = filter;
		input.checked = state.filter === filter;
		input.addEventListener('change', () => {
			state.filter = filter;
			rerender();
		});
		label.append(` ${FILTER_LABELS[filter]}`);
	}
}

function renderNode(parent: HTMLElement, node: Node, depth: number, state: ViewState, handlers: ViewHandlers): void {
	const li = el('li', `rdb-node rdb-${node.kind}`, undefined, parent);
	const children = node.children.filter((child) => matches(child, state.filter));
	const entries = state.filter === 'drafts' ? node.entries.filter((entry) => entry.status === 'draft') : node.entries;
	const hasBody = children.length > 0 || entries.length > 0;

	const row = el(hasBody ? 'summary' : 'div', 'rdb-row');
	el('span', 'rdb-label', node.label, row);

	if (!node.covered) {
		el('span', 'rdb-badge rdb-missing', 'Missing', row);
	}

	if (node.textChanged) {
		el('span', 'rdb-badge rdb-flag', 'Text changed', row);
	}

	el('span', 'rdb-counts', counts(node), row);

	if (!hasBody) {
		li.appendChild(row);
		return;
	}

	const details = el('details', undefined, undefined, li);
	details.open = state.open.get(node.key) ?? depth < OPEN_DEPTH;
	details.addEventListener('toggle', () => state.open.set(node.key, details.open));
	details.appendChild(row);

	if (entries.length) {
		const list = el('ul', 'rdb-entries', undefined, details);
		entries.forEach((entry) => renderEntry(list, entry, handlers));
	}

	if (children.length) {
		const list = el('ul', 'rdb-tree', undefined, details);
		children.forEach((child) => renderNode(list, child, depth + 1, state, handlers));
	}
}

function statusLabel(entry: Entry): string {
	return STATUS_LABELS[entry.status] ?? `Unknown status${entry.status ? `: ${entry.status}` : ''}`;
}

function renderEntry(parent: HTMLElement, entry: Entry, handlers: ViewHandlers): void {
	const li = el('li', `rdb-entry is-${entry.status || 'unknown'}`, undefined, parent);

	if (entry.date) {
		el('span', 'rdb-date', entry.date, li);
	}

	link(li, entry.title || 'Untitled entry', entry.path, entry.line, handlers);
	el('span', 'rdb-badge rdb-status', statusLabel(entry), li);
}

/** All draft entries, oldest first, as a table. */
export function renderInbox(container: HTMLElement, db: Db, handlers: ViewHandlers): void {
	container.replaceChildren();
	const root = el('div', 'rdb rdb-inbox', undefined, container);
	const drafts = db.entries.filter((entry) => entry.status === 'draft').sort((a, b) => a.date.localeCompare(b.date));

	el('div', 'rdb-title', `${db.root.label}: inbox`, root);
	el('p', 'rdb-summary', drafts.length ? `${plural(drafts.length, 'draft', 'drafts')} to review.` : 'No drafts to review.', root);

	if (!drafts.length) {
		return;
	}

	const table = el('table', 'rdb-table', undefined, el('div', 'rdb-table-wrap', undefined, root));
	const head = el('tr', undefined, undefined, el('thead', undefined, undefined, table));
	['Date', 'Entry', 'Items'].forEach((title) => (el('th', undefined, title, head).scope = 'col'));
	const body = el('tbody', undefined, undefined, table);

	for (const entry of drafts) {
		const row = el('tr', undefined, undefined, body);
		el('td', 'rdb-date', entry.date, row);

		const cell = el('td', undefined, undefined, row);
		link(el('strong', undefined, undefined, cell), entry.title || 'Untitled entry', entry.path, entry.line, handlers);

		if (entry.body) {
			const text = el('div', 'rdb-body', undefined, cell);

			if (handlers.renderMarkdown) {
				handlers.renderMarkdown(text, entry.body);
			} else {
				text.textContent = entry.body;
			}
		}

		for (const [key, value] of Object.entries(entry.fields)) {
			if (!BASE_FIELDS.includes(key)) {
				el('div', 'rdb-field', `${key}: ${value}`, cell);
			}
		}

		const items = el('ul', 'rdb-items', undefined, el('td', undefined, undefined, row));

		for (const target of entry.links) {
			const li = el('li', undefined, undefined, items);
			const node = target.id === null ? undefined : db.itemsById.get(target.id);

			if (!node) {
				el('span', undefined, `"${target.text}" `, li);
				el('span', 'rdb-badge rdb-flag', target.id === null ? 'Not an item' : 'No longer exists', li);
				continue;
			}

			link(li, node.label, node.path, node.line, handlers);

			if (node.textChanged) {
				el('span', 'rdb-badge rdb-flag', 'Text changed', li);
			}

			el('div', 'rdb-trail', node.trail.join(' › '), li);
		}
	}
}
