// Renders a Db into plain DOM. No Obsidian imports, so a browser page can
// preview it; main.ts supplies navigation and Markdown rendering.

import { type Db, type Entry, type Filter, type Node, FILTERS, matches } from './model';

export const VIEWS = ['overview', 'inbox'] as const;
export type View = (typeof VIEWS)[number];

export interface ViewState {
	view: View;
	filter: Filter;
	/** Open state per node key (and section), set when the user toggles it. */
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

const WARNINGS_KEY = '\0warnings';
const RETIRED_KEY = '\0retired';

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

function pill(parent: HTMLElement, text: string, modifier: string): void {
	el('span', `rdb-pill is-${modifier}`, text, parent);
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

/** A collapsible section that remembers its open state. */
function section(parent: HTMLElement, cls: string, key: string, title: string, state: ViewState, openByDefault: boolean): HTMLDetailsElement {
	const details = el('details', cls, undefined, parent);
	details.open = state.open.get(key) ?? openByDefault;
	details.addEventListener('toggle', () => state.open.set(key, details.open));
	el('summary', 'rdb-section-title', title, details);

	return details;
}

export function renderError(container: HTMLElement, message: string): void {
	container.replaceChildren();
	el('p', 'rdb-error', `Reviewed Entries: ${message}`, container);
}

export function renderDb(container: HTMLElement, db: Db, state: ViewState, handlers: ViewHandlers): void {
	container.replaceChildren();
	const root = el('div', 'rdb', undefined, container);
	const id = `rdb-${instance++}`;
	const drafts = db.entries.filter((entry) => entry.status === 'draft').length;

	el('div', 'rdb-title', db.root.label, root);

	const tablist = el('div', 'rdb-tabs', undefined, root);
	tablist.setAttribute('role', 'tablist');
	const tabs: HTMLButtonElement[] = [];
	const panels: HTMLElement[] = [];

	const select = (view: View) => {
		state.view = view;
		VIEWS.forEach((name, i) => {
			const selected = name === view;
			tabs[i].setAttribute('aria-selected', String(selected));
			tabs[i].tabIndex = selected ? 0 : -1;
			panels[i].hidden = !selected;
		});
	};

	VIEWS.forEach((view, i) => {
		const tab = el('button', 'rdb-tab', view === 'inbox' ? 'Inbox' : 'Overview', tablist);
		tab.setAttribute('role', 'tab');
		tab.id = `${id}-tab-${view}`;
		tab.setAttribute('aria-controls', `${id}-panel-${view}`);

		if (view === 'inbox') {
			el('span', 'rdb-tab-count', String(drafts), tab);
			tab.setAttribute('aria-label', `Inbox, ${plural(drafts, 'draft', 'drafts')}`);
		}

		tab.addEventListener('click', () => select(view));
		tab.addEventListener('keydown', (event) => {
			const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];

			if (step) {
				const next = (i + step + VIEWS.length) % VIEWS.length;
				select(VIEWS[next]);
				tabs[next].focus();
			}
		});
		tabs.push(tab);

		const panel = el('div', 'rdb-panel', undefined, root);
		panel.setAttribute('role', 'tabpanel');
		panel.id = `${id}-panel-${view}`;
		panel.setAttribute('aria-labelledby', tab.id);
		panels.push(panel);
	});

	renderOverview(panels[VIEWS.indexOf('overview')], db, state, handlers);
	renderInbox(panels[VIEWS.indexOf('inbox')], db, handlers);
	select(state.view);
}

function renderStats(parent: HTMLElement, stats: [label: string, value: number, note: string][]): void {
	const list = el('dl', 'rdb-stats', undefined, parent);

	for (const [label, value, note] of stats) {
		const tile = el('div', 'rdb-stat', undefined, list);
		el('dt', undefined, label, tile);
		const dd = el('dd', undefined, undefined, tile);
		el('span', 'rdb-stat-value', String(value), dd);
		el('span', 'rdb-stat-note', ` ${note}`, dd);
	}
}

function renderOverview(panel: HTMLElement, db: Db, state: ViewState, handlers: ViewHandlers): void {
	renderStats(panel, [
		['Missing', db.leaves.total - db.leaves.covered, `of ${db.leaves.total} lowest-level items`],
		['Entries', db.root.confirmed, 'confirmed'],
		['Drafts', db.root.drafts, 'to review'],
	]);

	const content = el('div', 'rdb-content');
	const renderContent = () => {
		content.replaceChildren();
		const visible = db.root.children.filter((child) => matches(child, state.filter));

		if (!visible.length) {
			el('p', 'rdb-card rdb-empty-state', db.root.children.length ? 'Nothing matches this filter.' : 'No items found.', content);
		}

		for (const group of visible) {
			renderNode(el('ul', 'rdb-card rdb-tree', undefined, content), group, 1, state, handlers);
		}

		const retired = state.filter === 'missing' ? [] : db.retired.filter((node) => matches(node, state.filter));

		if (retired.length) {
			const details = section(content, 'rdb-card rdb-retired', RETIRED_KEY, `Retired (${retired.length})`, state, false);
			el('p', 'rdb-note', 'No longer part of the database. Kept with their entries, not counted.', details);
			const list = el('ul', 'rdb-tree', undefined, details);
			retired.forEach((node) => renderNode(list, node, OPEN_DEPTH, state, handlers, true));
		}
	};

	const toolbar = el('div', 'rdb-toolbar', undefined, panel);
	renderFilter(toolbar, state, renderContent);

	if (db.warnings.length) {
		const details = section(panel, 'rdb-warnings', WARNINGS_KEY, plural(db.warnings.length, 'warning', 'warnings'), state, false);
		const list = el('ul', 'rdb-warning-list', undefined, details);

		for (const warning of db.warnings) {
			const li = el('li', undefined, undefined, list);
			el('span', 'rdb-warning-kind', warning.kind, li);
			link(li, warning.message, warning.path, warning.line, handlers);
		}
	}

	panel.appendChild(content);
	renderContent();
}

/** A segmented control built from radio inputs, so it keeps native keyboard behaviour. */
function renderFilter(parent: HTMLElement, state: ViewState, rerender: () => void): void {
	const fieldset = el('fieldset', 'rdb-segmented', undefined, parent);
	el('legend', 'rdb-visually-hidden', 'Show', fieldset);
	const name = `rdb-filter-${instance++}`;

	for (const filter of FILTERS) {
		const label = el('label', undefined, undefined, fieldset);
		const input = el('input', 'rdb-visually-hidden', undefined, label);
		input.type = 'radio';
		input.name = name;
		input.value = filter;
		input.checked = state.filter === filter;
		input.addEventListener('change', () => {
			state.filter = filter;
			rerender();
		});
		el('span', undefined, FILTER_LABELS[filter], label);
	}
}

function renderNode(parent: HTMLElement, node: Node, depth: number, state: ViewState, handlers: ViewHandlers, showTrail = false): void {
	const li = el('li', `rdb-node rdb-${node.kind} rdb-depth-${Math.min(depth, 3)}`, undefined, parent);
	const children = node.children.filter((child) => matches(child, state.filter));
	const entries = state.filter === 'drafts' ? node.entries.filter((entry) => entry.status === 'draft') : node.entries;
	const hasBody = children.length > 0 || entries.length > 0;

	const row = el(hasBody ? 'summary' : 'div', 'rdb-row');
	const main = el('span', 'rdb-row-main', undefined, row);
	// Empty on leaf rows, to keep labels aligned.
	el('span', 'rdb-marker', undefined, main).setAttribute('aria-hidden', 'true');
	const text = el('span', 'rdb-row-text', undefined, main);
	el('span', 'rdb-label', node.label, text);

	if (showTrail && node.trail.length) {
		el('span', 'rdb-trail', node.trail.join(' › '), text);
	}

	const meta = el('span', 'rdb-row-meta', undefined, row);

	if (!node.covered && !node.retired) pill(meta, 'Missing', 'missing');
	if (node.textChanged) pill(meta, 'Text changed', 'warning');

	el('span', 'rdb-counts', counts(node), meta);

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

function statusPill(parent: HTMLElement, entry: Entry): void {
	const known = STATUS_LABELS[entry.status];
	pill(parent, known ?? `Unknown status${entry.status ? `: ${entry.status}` : ''}`, known ? entry.status : 'error');
}

function renderEntry(parent: HTMLElement, entry: Entry, handlers: ViewHandlers): void {
	const li = el('li', `rdb-entry is-${entry.status || 'unknown'}`, undefined, parent);
	el('span', 'rdb-date', entry.date, li);
	link(li, entry.title || 'Untitled entry', entry.path, entry.line, handlers);
	statusPill(li, entry);
}

/** All draft entries, oldest first, one card each. */
function renderInbox(panel: HTMLElement, db: Db, handlers: ViewHandlers): void {
	const drafts = db.entries.filter((entry) => entry.status === 'draft').sort((a, b) => a.date.localeCompare(b.date));

	if (!drafts.length) {
		el('p', 'rdb-card rdb-empty-state', 'No drafts to review.', panel);
		return;
	}

	el('p', 'rdb-summary', `${plural(drafts.length, 'draft', 'drafts')} to review, oldest first.`, panel);
	const list = el('ol', 'rdb-inbox', undefined, panel);

	for (const entry of drafts) {
		const card = el('li', 'rdb-card rdb-entry-card', undefined, list);
		const header = el('div', 'rdb-entry-header', undefined, card);
		link(el('div', 'rdb-entry-title', undefined, header), entry.title || 'Untitled entry', entry.path, entry.line, handlers);
		el('span', 'rdb-date', entry.date, header);

		if (entry.body) {
			const text = el('div', 'rdb-body', undefined, card);

			if (handlers.renderMarkdown) {
				handlers.renderMarkdown(text, entry.body);
			} else {
				text.textContent = entry.body;
			}
		}

		const fields = Object.entries(entry.fields).filter(([key]) => !BASE_FIELDS.includes(key));

		if (fields.length) {
			const dl = el('dl', 'rdb-fields', undefined, card);

			for (const [key, value] of fields) {
				el('dt', undefined, key, dl);
				el('dd', undefined, value, dl);
			}
		}

		el('div', 'rdb-label-small', 'Linked to', card);
		const chips = el('ul', 'rdb-chips', undefined, card);

		for (const target of entry.links) {
			const chip = el('li', 'rdb-chip', undefined, chips);
			const node = target.id === null ? undefined : db.itemsById.get(target.id);
			const line = el('div', 'rdb-chip-line', undefined, chip);

			if (!node) {
				el('span', undefined, target.text, line);
				pill(line, target.id === null ? 'Not an item' : 'No longer exists', 'error');
				continue;
			}

			link(line, node.label, node.path, node.line, handlers);

			if (node.retired) pill(line, 'Retired', 'retired');
			if (node.textChanged) pill(line, 'Text changed', 'warning');

			el('div', 'rdb-trail', node.trail.join(' › '), chip);
		}
	}
}
