import { type App, FuzzySuggestModal, type FuzzyMatch, Modal, Setting } from 'obsidian';
import { type EntryInput, type Node, type Status, STATUSES } from './model';

export const STATUS_LABELS: Record<Status, string> = { draft: 'Draft', confirmed: 'Confirmed', rejected: 'Rejected' };

export interface EntryModalOptions {
	heading: string;
	submitLabel: string;
	initial: EntryInput;
	/** Items that can be linked: not retired. */
	items: Node[];
	itemsById: Map<string, Node>;
	/** Link target for an item, relative to the entry's file. */
	linkTarget(node: Node): string;
	onSubmit(input: EntryInput): Promise<void>;
}

/** Form to edit an entry or add one. */
export class EntryModal extends Modal {
	private options: EntryModalOptions;
	private input: EntryInput;

	constructor(app: App, options: EntryModalOptions) {
		super(app);
		this.options = options;
		this.input = { ...options.initial, links: [...options.initial.links], fields: { ...options.initial.fields } };
	}

	onOpen(): void {
		const { contentEl } = this;
		const input = this.input;
		this.modalEl.addClass('rdb-modal');
		this.setTitle(this.options.heading);

		new Setting(contentEl).setName('Title').addText((text) => {
			text.setValue(input.title).onChange((value) => (input.title = value));
			text.inputEl.required = true;
		});

		new Setting(contentEl).setName('Date').addText((text) => {
			text.inputEl.type = 'date';
			text.setValue(input.date).onChange((value) => (input.date = value));
			text.inputEl.required = true;
		});

		new Setting(contentEl).setName('Status').addDropdown((dropdown) => {
			STATUSES.forEach((status) => dropdown.addOption(status, STATUS_LABELS[status]));
			dropdown.setValue(input.status).onChange((value) => (input.status = value as Status));
		});

		const body = new Setting(contentEl).setName('Description').setDesc('Markdown.');
		body.settingEl.addClass('rdb-setting-stacked');
		body.addTextArea((area) => {
			area.setValue(input.body).onChange((value) => (input.body = value));
			area.inputEl.rows = 6;
		});

		const links = new Setting(contentEl).setName('Linked to');
		links.settingEl.addClass('rdb-setting-stacked');
		const chips = links.controlEl.createEl('ul', { cls: 'rdb-chips' });
		const renderChips = () => {
			chips.empty();

			for (const link of input.links) {
				const node = link.id === null ? undefined : this.options.itemsById.get(link.id);
				const chip = chips.createEl('li', { cls: 'rdb-chip' });
				const line = chip.createDiv({ cls: 'rdb-chip-line' });
				line.createSpan({ text: node?.label ?? link.text });

				if (!node) line.createSpan({ cls: 'rdb-pill is-error', text: link.id === null ? 'Not an item' : 'No longer exists' });
				if (node?.retired) line.createSpan({ cls: 'rdb-pill is-retired', text: 'Retired' });

				const remove = line.createEl('button', { cls: 'rdb-chip-remove', text: '×' });
				remove.setAttribute('aria-label', `Remove ${node?.label ?? link.text}`);
				remove.addEventListener('click', () => {
					input.links = input.links.filter((other) => other !== link);
					renderChips();
				});

				if (node) chip.createDiv({ cls: 'rdb-trail', text: node.trail.join(' › ') });
			}
		};
		renderChips();

		links.addButton((button) =>
			button.setButtonText('Add item').onClick(() => {
				const linked = new Set(input.links.map((link) => link.id));
				const candidates = this.options.items.filter((node) => !linked.has(node.key));

				new ItemPicker(this.app, candidates, (node) => {
					input.links.push({ target: this.options.linkTarget(node), id: node.key, text: node.label });
					renderChips();
				}).open();
			}),
		);

		const error = contentEl.createEl('p', { cls: 'rdb-form-error' });
		error.setAttribute('role', 'alert');

		new Setting(contentEl)
			.addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((button) =>
				button
					.setButtonText(this.options.submitLabel)
					.setCta()
					.onClick(async () => {
						const problem = validate(input);
						error.setText(problem ?? '');

						if (problem) {
							return;
						}

						button.setDisabled(true);

						try {
							await this.options.onSubmit(input);
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
}

function validate(input: EntryInput): string | null {
	if (!input.title.trim()) return 'Add a title.';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'Add a date.';
	if (!input.links.length) return 'Link at least one item.';

	return null;
}

/** Search items by their text and path. */
class ItemPicker extends FuzzySuggestModal<Node> {
	private items: Node[];
	private onPick: (node: Node) => void;

	constructor(app: App, items: Node[], onPick: (node: Node) => void) {
		super(app);
		this.items = items;
		this.onPick = onPick;
		this.setPlaceholder('Search items');
	}

	getItems(): Node[] {
		return this.items;
	}

	getItemText(node: Node): string {
		return [...node.trail, node.label].join(' › ');
	}

	renderSuggestion(match: FuzzyMatch<Node>, el: HTMLElement): void {
		el.createDiv({ text: match.item.label });
		el.createDiv({ cls: 'rdb-trail', text: match.item.trail.join(' › ') });
	}

	onChooseItem(node: Node): void {
		this.onPick(node);
	}
}
