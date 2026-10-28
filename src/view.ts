// Renders a Db into plain DOM. No Obsidian imports, so a browser page can
// preview it; main.ts supplies navigation.

import { type Db, type Entry, type Filter, type Node, FILTERS, matches } from './model';

export interface ViewState {
	filter: Filter;
	/** Open state per node key, set when the user toggles a row. */
	open: Map<string, boolean>;
}

export interface ViewHandlers {
	/** Open a file at a 0-based line; `event` tells whether to use a new tab. */
	openLine(path: string, line: number, event: MouseEvent): void;
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

function link(parent: HTMLElement, text: string, path: string, line: number, handlers: ViewHandlers): void {
	const a = el('a', 'rdb-link', text, parent);
	a.href = '#';
	a.addEventListener('click', (event) => {
		event.preventDefault();
		handlers.openLine(path, line, event);
	});
}

export function renderError(container: HTMLElement, message: string): void {
	container.replaceChildren();
	el('p', 'rdb-error', `Reviewed Entries: ${message}`, container);
}

export function renderDb(container: HTMLElement, db: Db, state: ViewState, handlers: ViewHandlers): void {
	container.replaceChildren();
	const root = el('div', 'rdb', undefined, container);

	el('div', 'rdb-title', db.root.label, root);
	el('p', 'rdb-summary', `${db.leaves.covered} of ${db.leaves.total} lowest-level items covered. ${counts(db.root)}.`, root);

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

function counts(node: Node): string {
	return `${node.confirmed} confirmed · ${node.drafts} draft`;
}

function renderNode(parent: HTMLElement, node: Node, depth: number, state: ViewState, handlers: ViewHandlers): void {
	const li = el('li', `rdb-node rdb-${node.kind}`, undefined, parent);
	const children = node.children.filter((child) => matches(child, state.filter));
	const entries = state.filter === 'drafts' ? node.entries.filter((entry) => entry.status === 'draft') : node.entries;
	const hasBody = children.length > 0 || entries.length > 0;

	const row = el(hasBody ? 'summary' : 'div', 'rdb-row');
	el('span', 'rdb-label', node.label, row);
	el('span', `rdb-coverage ${node.covered ? 'is-covered' : 'is-missing'}`, node.covered ? 'Covered' : 'Missing', row);

	if (node.textChanged) {
		el('span', 'rdb-flag', 'Text changed', row);
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

function renderEntry(parent: HTMLElement, entry: Entry, handlers: ViewHandlers): void {
	const li = el('li', `rdb-entry is-${entry.status || 'unknown'}`, undefined, parent);

	if (entry.date) {
		el('span', 'rdb-date', entry.date, li);
	}

	link(li, entry.title || 'Untitled entry', entry.path, entry.line, handlers);
	el('span', 'rdb-status', STATUS_LABELS[entry.status] ?? `Unknown status${entry.status ? `: ${entry.status}` : ''}`, li);
}
