import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { buildDb, parseConfig, parseEntries, parseItems } from '../src/model.ts';

const vault = new URL('../fixture/', import.meta.url).pathname;

async function loadFixture() {
	const paths = (await readdir(vault, { recursive: true })).filter((path) => path.endsWith('.md') && !path.startsWith('.obsidian'));
	const files = await Promise.all(paths.map(async (path) => ({ path: relative(vault, join(vault, path)), text: await readFile(join(vault, path), 'utf8') })));

	const config = parseConfig({
		'reviewed-db': 'Learning log (fixture)',
		'items-folder': 'Goals',
		'entries-folder': 'Log',
		order: ['Music', 'Languages'],
	});

	return buildDb(config, files);
}

function find(node, label) {
	if (node.label === label) return node;

	for (const child of node.children) {
		const found = find(child, label);
		if (found) return found;
	}
}

test('parseItems nests list items by indentation and strips IDs and tags', () => {
	const items = parseItems('---\ntitle: x\n---\n# H\n\n- A ^a\n\t- plain\n\t\t- B #text-changed ^b\n- C ^c\n\n```\n- D ^d\n```\n');

	assert.deepEqual(items.map((item) => item.id), ['a', 'c']);
	assert.equal(items[0].children[0].id, 'b');
	assert.equal(items[0].children[0].text, 'B');
	assert.equal(items[0].children[0].textChanged, true);
});

test('parseEntries reads heading, fields and links', () => {
	const [entry] = parseEntries('log.md', '## 2026-10-01 Title with C#\nid:: x1\n- Status:: Confirmed\nitems:: [[F#^a|A]], [[G]]\nitems:: [[H#^b]]\n');

	assert.equal(entry.date, '2026-10-01');
	assert.equal(entry.title, 'Title with C#');
	assert.equal(entry.status, 'confirmed');
	assert.deepEqual(entry.links.map((link) => link.id), ['a', null, 'b']);
});

test('parseConfig rejects a bad coverage rule', () => {
	assert.throws(() => parseConfig({ 'reviewed-db': 'x', 'items-folder': 'a', 'entries-folder': 'b', coverage: 'most' }));
});

test('fixture: coverage, counts and order', async () => {
	const db = await loadFixture();

	assert.deepEqual(db.root.children.map((node) => node.label), ['Music', 'Languages']);
	assert.deepEqual(db.leaves, { covered: 5, total: 7 });
	assert.deepEqual([db.root.confirmed, db.root.drafts], [4, 2]);

	const expected = {
		Languages: false,
		Spanish: false,
		'Holds a conversation': false,
		'Orders food in a restaurant': true,
		'Asks for directions': false,
		'Reads a short story': true,
		'French.md': true,
		'Spells accents correctly': true,
		Music: false,
		'Plays a full song': true,
		'Tunes by ear': false,
	};

	for (const [label, covered] of Object.entries(expected)) {
		const node = find(db.root, label.replace(/\.md$/, ''));
		assert.equal(node?.covered, covered, label);
	}

	const guitar = find(db.root, 'Guitar');
	assert.deepEqual([guitar.confirmed, guitar.drafts], [2, 1]);
	assert.equal(find(db.root, 'Asks for directions').textChanged, true);
});

test('fixture: coverage rule any', async () => {
	const files = [
		{ path: 'I/F.md', text: '- S ^s\n\t- A ^a\n\t- B ^b\n' },
		{ path: 'E/1.md', text: '## 2026-01-01 X\nid:: 1\nstatus:: confirmed\nitems:: [[F#^a]]\n' },
	];
	const config = { name: 'x', itemsFolder: 'I', entriesFolder: 'E', coverage: 'any', order: [] };

	assert.equal(buildDb(config, files).root.covered, true);
	assert.equal(buildDb({ ...config, coverage: 'all' }, files).root.covered, false);
});

test('fixture: warnings', async () => {
	const db = await loadFixture();

	assert.deepEqual(db.warnings.map((warning) => warning.kind).sort(), [
		'Broken link',
		'Duplicate ID',
		'Invalid status',
		'Text changed',
		'Unresolved link',
	]);
});
