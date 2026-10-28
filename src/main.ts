import {
	type App,
	type MarkdownPostProcessorContext,
	FuzzySuggestModal,
	Keymap,
	MarkdownRenderChild,
	MarkdownRenderer,
	Notice,
	Plugin,
	TFile,
	debounce,
	normalizePath,
} from 'obsidian';
import { EntryModal } from './entry-modal';
import {
	type Db,
	type DbConfig,
	type Entry,
	type EntryInput,
	type Filter,
	type Node,
	type Status,
	FILTERS,
	appendEntry,
	buildDb,
	entryInput,
	formatEntry,
	isDbFile,
	newEntryId,
	parseBlockParams,
	parseConfig,
	replaceEntry,
	setEntryStatus,
} from './model';
import { type View, type ViewHandlers, type ViewState, VIEWS, renderDb, renderError } from './view';

export default class ReviewedEntriesPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerMarkdownCodeBlockProcessor('reviewed-db', (source, el, ctx) => {
			ctx.addChild(new Block(this.app, el, source, ctx));
		});

		this.addCommand({
			id: 'open-database',
			name: 'Open database',
			callback: () => this.openDatabase(),
		});
	}

	private openDatabase(): void {
		const notes = this.app.vault
			.getMarkdownFiles()
			.filter((file) => this.app.metadataCache.getFileCache(file)?.frontmatter?.['reviewed-db'] != null);

		if (notes.length === 0) {
			new Notice('No note with a reviewed-db property found.');
			return;
		}

		const open = (file: TFile) => void this.app.workspace.getLeaf(false).openFile(file);

		if (notes.length === 1) {
			open(notes[0]);
			return;
		}

		new DatabasePicker(this.app, notes, open).open();
	}
}

class DatabasePicker extends FuzzySuggestModal<TFile> {
	private notes: TFile[];
	private onPick: (file: TFile) => void;

	constructor(app: App, notes: TFile[], onPick: (file: TFile) => void) {
		super(app);
		this.notes = notes;
		this.onPick = onPick;
		this.setPlaceholder('Open database');
	}

	getItems(): TFile[] {
		return this.notes;
	}

	getItemText(file: TFile): string {
		return `${this.app.metadataCache.getFileCache(file)?.frontmatter?.['reviewed-db']} (${file.path})`;
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}

class Block extends MarkdownRenderChild {
	private app: App;
	private source: string;
	private ctx: MarkdownPostProcessorContext;
	private state: ViewState;
	private dbPath = '';
	private config: DbConfig | null = null;
	private rerender = debounce(() => void this.render(), 300, true);

	constructor(app: App, containerEl: HTMLElement, source: string, ctx: MarkdownPostProcessorContext) {
		super(containerEl);
		this.app = app;
		this.source = source;
		this.ctx = ctx;

		const params = parseBlockParams(source);
		const view = params['view'] as View;
		const filter = params['filter'] as Filter;
		this.state = { view: VIEWS.includes(view) ? view : 'overview', filter: FILTERS.includes(filter) ? filter : 'all', open: new Map() };
	}

	onload(): void {
		const relevant = (path: string) => path === this.dbPath || (this.config !== null && isDbFile(this.config, path));
		const onChange = (file: { path: string }, oldPath?: string) => {
			if (relevant(file.path) || (oldPath !== undefined && relevant(oldPath))) {
				this.rerender();
			}
		};

		this.registerEvent(this.app.metadataCache.on('changed', onChange));
		this.registerEvent(this.app.vault.on('delete', (file) => onChange(file)));
		this.registerEvent(this.app.vault.on('rename', onChange));

		void this.render();
	}

	private async render(): Promise<void> {
		const { metadataCache, vault } = this.app;
		const dbLink = parseBlockParams(this.source)['db'];
		const dbFile = dbLink
			? metadataCache.getFirstLinkpathDest(dbLink, this.ctx.sourcePath)
			: vault.getFileByPath(this.ctx.sourcePath);

		if (!dbFile) {
			renderError(this.containerEl, `Database note not found: ${dbLink}`);
			return;
		}

		this.dbPath = dbFile.path;

		try {
			this.config = parseConfig(metadataCache.getFileCache(dbFile)?.frontmatter);
		} catch (error) {
			renderError(this.containerEl, `${dbFile.path}: ${(error as Error).message}`);
			return;
		}

		const config = this.config;

		// shortcut: rereads every database file on each change; fine for a few hundred files, cache per file if it gets slow.
		const files = vault.getMarkdownFiles().filter((file) => file.path !== dbFile.path && isDbFile(config, file.path));
		const sources = await Promise.all(files.map(async (file) => ({ path: file.path, text: await vault.cachedRead(file) })));

		const db = buildDb(config, sources);
		const handlers: ViewHandlers = {
			openLine: (path: string, line: number, event: MouseEvent) => {
				const file = vault.getFileByPath(path);

				if (file) {
					void this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(file, { eState: { line } });
				}
			},
			renderMarkdown: (el: HTMLElement, markdown: string) => {
				void MarkdownRenderer.render(this.app, markdown, el, this.ctx.sourcePath, this);
			},
			review: this.review(config, db),
		};

		renderDb(this.containerEl, db, this.state, handlers);
	}

	/** Writes go through vault.process, which re-reads the file, so they act on its current text. */
	private review(config: DbConfig, db: Db): ViewHandlers['review'] {
		const { metadataCache, vault } = this.app;
		const items = linkable(db.root);

		const write = async (path: string, change: (text: string) => string) => {
			const file = vault.getFileByPath(path);

			if (!file) {
				throw new Error(`${path} not found.`);
			}

			await vault.process(file, change);
		};

		const openForm = (heading: string, submitLabel: string, initial: EntryInput, path: string, save: (input: EntryInput) => Promise<void>) => {
			new EntryModal(this.app, {
				heading,
				submitLabel,
				initial,
				items,
				itemsById: db.itemsById,
				linkTarget: (node: Node) => {
					const file = vault.getFileByPath(node.path);
					return file ? metadataCache.fileToLinktext(file, path, true) : node.path;
				},
				onSubmit: save,
			}).open();
		};

		return {
			setStatus: async (entry: Entry, status: Status) => {
				try {
					await write(entry.path, (text) => setEntryStatus(text, entry.id, status));
				} catch (error) {
					new Notice(`Could not update "${entry.title}": ${(error as Error).message}`);
					throw error;
				}
			},
			edit: (entry: Entry) => {
				openForm('Edit entry', 'Save', entryInput(entry), entry.path, (input) =>
					write(entry.path, (text) => replaceEntry(text, entry.id, input)),
				);
			},
			create: () => {
				// Local date: shift by the timezone offset before taking the ISO date.
				const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
				const taken = new Set(db.entries.map((entry) => entry.id));
				const initial: EntryInput = { id: '', date, title: '', status: 'confirmed', links: [], fields: {}, body: '' };
				const logPath = (input: EntryInput) => normalizePath(`${config.entriesFolder}/${input.date.slice(0, 7)}.md`);

				openForm('New entry', 'Add entry', initial, logPath(initial), async (input) => {
					const entry = { ...input, id: newEntryId(input.date, taken) };
					const path = logPath(entry);

					if (vault.getFileByPath(path)) {
						await write(path, (text) => appendEntry(text, entry));
						return;
					}

					if (!vault.getFolderByPath(config.entriesFolder)) {
						await vault.createFolder(config.entriesFolder);
					}

					await vault.create(path, `# ${entry.date.slice(0, 7)}\n\n${formatEntry(entry)}\n`);
				});
			},
		};
	}
}

/** Items an entry can be linked to: everything in the tree, not retired ones. */
function linkable(node: Node): Node[] {
	return node.children.flatMap((child) => (child.kind === 'item' ? [child, ...linkable(child)] : linkable(child)));
}
