import { type App, Modal, Setting } from 'obsidian';
import { STATUS_LABELS } from './entry-modal';
import { type Entry, type Node, type Status } from './model';

export interface ResolveModalOptions {
	node: Node;
	canReview(entry: Entry): boolean;
	renderMarkdown(el: HTMLElement, markdown: string): void;
	setStatus(entry: Entry, status: Status): Promise<void>;
	/** Open the entry form; `onSaved` runs once the entry is written. */
	edit(entry: Entry, onSaved: () => void): void;
	/** Clear the item's tag; with `relabel`, also update the link text in its entries. */
	onResolve(relabel: boolean): Promise<void>;
}

/** Check the entries of an item whose text changed, then clear its `#text-changed` tag. */
export class ResolveModal extends Modal {
	private options: ResolveModalOptions;
	private relabel = false;

	constructor(app: App, options: ResolveModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		const { node } = this.options;
		this.modalEl.addClass('rdb-modal');
		this.setTitle('Text changed');

		contentEl.createEl('p', { text: 'This item’s text changed after entries were linked to it. Check that each entry still fits, then mark the change as resolved.' });

		const item = contentEl.createDiv({ cls: 'rdb-chip rdb-resolve-item' });
		item.createDiv({ cls: 'rdb-label-small', text: 'Current text' });
		item.createDiv({ text: node.label });
		item.createDiv({ cls: 'rdb-trail', text: node.trail.join(' › ') });

		const entries = node.entries;
		contentEl.createDiv({ cls: 'rdb-label-small', text: `Linked entries (${entries.length})` });

		if (!entries.length) {
			contentEl.createEl('p', { cls: 'rdb-note', text: 'No entries link to this item.' });
		}

		const list = contentEl.createEl('ul', { cls: 'rdb-resolve-list' });
		entries.forEach((entry) => this.renderEntry(list, entry));

		if (entries.length) {
			new Setting(contentEl)
				.setName('Update link text')
				.setDesc('Replace the text stored in each link with the current text. When off, entries keep the text they were linked with.')
				.addToggle((toggle) => toggle.setValue(false).onChange((value) => (this.relabel = value)));
		}

		const error = contentEl.createEl('p', { cls: 'rdb-form-error' });
		error.setAttribute('role', 'alert');

		new Setting(contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText('Mark as resolved')
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);

						try {
							await this.options.onResolve(this.relabel);
							this.close();
						} catch (cause) {
							error.setText(`Could not save: ${(cause as Error).message}`);
							button.setDisabled(false);
						}
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderEntry(list: HTMLElement, entry: Entry): void {
		const { node, canReview, renderMarkdown, setStatus, edit } = this.options;
		const li = list.createEl('li', { cls: 'rdb-chip rdb-resolve-entry' });
		const name = entry.title || 'Untitled entry';

		const header = li.createDiv({ cls: 'rdb-entry-header' });
		header.createSpan({ cls: 'rdb-entry-title', text: name });
		header.createSpan({ cls: 'rdb-date', text: entry.date });

		const linkedAs = entry.links.find((link) => link.id === node.key)?.text ?? '';
		li.createDiv({ cls: 'rdb-linked-as', text: linkedAs === node.label ? 'Linked with the current text.' : `Linked as: “${linkedAs}”` });

		if (entry.body) {
			renderMarkdown(li.createDiv({ cls: 'rdb-body' }), entry.body);
		}

		const actions = li.createDiv({ cls: 'rdb-chip-line' });
		const status = STATUS_LABELS[entry.status as Status];
		actions.createSpan({ cls: `rdb-pill is-${status ? entry.status : 'error'}`, text: status ?? 'Unknown status' });

		if (!canReview(entry)) {
			actions.createSpan({ cls: 'rdb-note', text: 'Give this entry a unique id to review it here.' });
			return;
		}

		const done = (text: string, modifier: string) => {
			actions.empty();
			actions.createSpan({ cls: `rdb-pill is-${modifier}`, text });
		};

		const editButton = actions.createEl('button', { text: 'Edit' });
		editButton.setAttribute('aria-label', `Edit ${name}`);
		editButton.addEventListener('click', () => edit(entry, () => done('Edited', 'neutral')));

		if (entry.status === 'rejected') {
			return;
		}

		const reject = actions.createEl('button', { cls: 'rdb-button-reject', text: 'Reject' });
		reject.setAttribute('aria-label', `Reject ${name}`);
		reject.addEventListener('click', async () => {
			reject.disabled = true;

			try {
				await setStatus(entry, 'rejected');
				done('Rejected', 'rejected');
			} catch {
				reject.disabled = false;
			}
		});
	}
}
