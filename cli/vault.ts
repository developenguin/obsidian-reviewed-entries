// Finds the user's tracker folder and reads it with the plugin's model, so the
// scripts and the Obsidian overview agree on coverage.
//
// Location, in order: the MATRIX_RELOADED_VAULT and MATRIX_RELOADED_FOLDER
// environment variables, then ~/.matrix-reloaded.json ({ "vault", "folder" }),
// written by `tracker init`.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildDb, parseConfig, type Db, type DbConfig, type SourceFile } from '../src/model.ts';

export const SETTINGS_FILE = join(homedir(), '.matrix-reloaded.json');

export interface Location {
	/** Absolute path of the Obsidian vault. */
	vault: string;
	/** Tracker folder, relative to the vault. */
	folder: string;
}

export function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

export function location(): Location {
	const fromEnv = process.env.MATRIX_RELOADED_VAULT;

	if (fromEnv) {
		return { vault: fromEnv, folder: process.env.MATRIX_RELOADED_FOLDER ?? 'Matrix Reloaded' };
	}

	if (!existsSync(SETTINGS_FILE)) {
		fail(`No tracker set up: ${SETTINGS_FILE} is missing. Run \`tracker init --vault <path>\` first.`);
	}

	const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) as Partial<Location>;

	if (!settings.vault || !settings.folder) {
		fail(`${SETTINGS_FILE} needs "vault" and "folder".`);
	}

	return { vault: settings.vault, folder: settings.folder };
}

/** Vault-relative paths of the tracker's notes. */
export function notes(folder: string) {
	return {
		database: `${folder}/Overview.md`,
		config: `${folder}/Config.md`,
		guidelines: `${folder}/Rating guidelines.md`,
		statements: `${folder}/Statements`,
		evidence: `${folder}/Evidence`,
		source: `${folder}/Source`,
	};
}

/** Flat YAML frontmatter: `key: value` scalars and `- value` lists. */
export function frontmatter(text: string): Record<string, string | string[]> {
	const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
	const result: Record<string, string | string[]> = {};
	let listKey: string | null = null;

	for (const line of block.split(/\r?\n/)) {
		const item = /^\s+-\s+(.*?)\s*$/.exec(line);

		if (item && listKey) {
			(result[listKey] as string[]).push(unquote(item[1]));
			continue;
		}

		const pair = /^([\w-]+):\s*(.*?)\s*$/.exec(line);

		if (!pair) {
			continue;
		}

		const [, key, value] = pair;

		if (value === '' || value === '[]') {
			result[key] = [];
			listKey = key;
		} else {
			result[key] = unquote(value);
			listKey = null;
		}
	}

	return result;
}

function unquote(value: string): string {
	return value.replace(/^(['"])(.*)\1$/, '$2');
}

/** Replace one frontmatter property, or add it. A list replaces the whole list. */
export function setProperty(text: string, key: string, value: string | string[]): string {
	const [, block, rest] = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/.exec(text) ?? fail('The note has no frontmatter.');
	const lines = block.split(/\r?\n/);
	const replacement = Array.isArray(value)
		? value.length
			? [`${key}:`, ...value.map((item) => `  - ${JSON.stringify(item)}`)]
			: [`${key}: []`]
		: [`${key}: ${value}`];
	const start = lines.findIndex((line) => line.startsWith(`${key}:`));

	if (start < 0) {
		lines.push(...replacement);
	} else {
		let end = start + 1;

		while (end < lines.length && /^\s+-\s/.test(lines[end])) {
			end++;
		}

		lines.splice(start, end - start, ...replacement);
	}

	return `---\n${lines.join('\n')}\n---${rest ?? '\n'}`;
}

export class Vault {
	readonly root: string;
	readonly folder: string;
	readonly notes: ReturnType<typeof notes>;

	constructor(where: Location = location()) {
		this.root = where.vault;
		this.folder = where.folder;
		this.notes = notes(where.folder);
	}

	path(note: string): string {
		return join(this.root, note);
	}

	read(note: string): string {
		return readFileSync(this.path(note), 'utf8');
	}

	write(note: string, text: string): void {
		writeFileSync(this.path(note), text);
	}

	settings(): Record<string, string | string[]> {
		return frontmatter(this.read(this.notes.config));
	}

	setting(key: string): string {
		const value = this.settings()[key];

		return typeof value === 'string' ? value : '';
	}

	list(key: string): string[] {
		const value = this.settings()[key];

		return Array.isArray(value) ? value : value ? [value] : [];
	}

	private markdownFiles(folder: string): SourceFile[] {
		return readdirSync(this.path(folder), { withFileTypes: true }).flatMap((entry) => {
			const path = `${folder}/${entry.name}`;

			if (entry.isDirectory()) {
				return this.markdownFiles(path);
			}

			return path.endsWith('.md') ? [{ path, text: this.read(path) }] : [];
		});
	}

	load(): { config: DbConfig; db: Db } {
		const config = parseConfig(frontmatter(this.read(this.notes.database)));
		const files = [...this.markdownFiles(config.itemsFolder), ...this.markdownFiles(config.entriesFolder)];

		return { config, db: buildDb(config, files) };
	}

	/** Block IDs linked from the `focus` property in Config.md. */
	focusIds(): Set<string> {
		return new Set(this.list('focus').flatMap((value) => [...value.matchAll(/#\^([A-Za-z0-9-]+)/g)].map((match) => match[1])));
	}
}
