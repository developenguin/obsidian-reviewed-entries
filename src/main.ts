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
} from 'obsidian';
import { type DbConfig, type Filter, FILTERS, buildDb, isDbFile, parseBlockParams, parseConfig } from './model';
import { type View, type ViewState, VIEWS, renderDb, renderError, renderInbox } from './view';

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
	private view: View;
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
		this.view = VIEWS.includes(view) ? view : 'overview';
		this.state = { filter: FILTERS.includes(filter) ? filter : 'all', open: new Map() };
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
		const handlers = {
			openLine: (path: string, line: number, event: MouseEvent) => {
				const file = vault.getFileByPath(path);

				if (file) {
					void this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(file, { eState: { line } });
				}
			},
			renderMarkdown: (el: HTMLElement, markdown: string) => {
				void MarkdownRenderer.render(this.app, markdown, el, this.ctx.sourcePath, this);
			},
		};

		if (this.view === 'inbox') {
			renderInbox(this.containerEl, db, handlers);
		} else {
			renderDb(this.containerEl, db, this.state, handlers);
		}
	}
}
