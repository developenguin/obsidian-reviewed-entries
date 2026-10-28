import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { appendEntry, buildDb, entryInput, formatEntry, newEntryId, parseConfig, parseEntries, parseItems, replaceEntry, setEntryStatus } from '../src/model.ts';

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
	assert.deepEqual(entry.links.map((link) => link.text), ['A', 'G', 'H']);
	assert.equal(entry.body, '');
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
	assert.deepEqual(find(db.root, 'Asks for directions').trail, ['Languages', 'Spanish', 'Holds a conversation']);
	assert.equal(db.entries.filter((entry) => entry.status === 'draft').length, 2);
	assert.match(db.entries.find((entry) => entry.date === '2026-10-03').body, /^Asked a stranger/);
});

test('fixture: retired items leave the tree and coverage', async () => {
	const db = await loadFixture();

	assert.deepEqual(db.retired.map((node) => [node.label, node.confirmed, node.trail.join(' › ')]), [
		['Uses the subjunctive', 1, 'Languages › Spanish'],
	]);
	assert.equal(find(db.root, 'Uses the subjunctive'), undefined);
	assert.deepEqual(db.leaves, { covered: 5, total: 7 });
	assert.equal(find(db.root, 'Spanish').confirmed, 2);
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

test('items keep source order; folders and files sort by name', () => {
	const files = [
		{ path: 'I/B/Z.md', text: '- Zulu ^z\n\t- Yankee ^y\n\t- Alpha ^a\n- Bravo ^b\n' },
		{ path: 'I/B/A.md', text: '- Charlie ^c\n' },
		{ path: 'I/A/X.md', text: '- Delta ^d\n' },
	];
	const config = { name: 'x', itemsFolder: 'I', entriesFolder: 'E', coverage: 'all', order: [] };
	const root = buildDb(config, files).root;
	const labels = (node) => node.children.map((child) => child.label);

	assert.deepEqual(labels(root), ['A', 'B']);
	assert.deepEqual(labels(root.children[1]), ['A', 'Z']);

	const file = root.children[1].children[1];

	assert.deepEqual(labels(file), ['Zulu', 'Bravo']);
	assert.deepEqual(labels(file.children[0]), ['Yankee', 'Alpha']);
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

	for (const warning of db.warnings) {
		assert.doesNotMatch(warning.message, /\^|\[\[|2026\d{4}-/, warning.message);
	}
});

const LOG = `# 2026-10

## 2026-10-01 First
id:: a1
- status:: draft
items:: [[F#^x|X]]
source:: notes

Body with code:

\`\`\`
## not a heading
key:: not a field
\`\`\`

## 2026-10-02 Second
id:: b2
status:: draft
items:: [[F#^y|Y]]
`;

test('setEntryStatus rewrites only that status line', () => {
	const out = setEntryStatus(LOG, 'a1', 'confirmed');

	assert.equal(out, LOG.replace('- status:: draft', '- status:: confirmed'));
	assert.deepEqual(parseEntries('', out).map((entry) => entry.status), ['confirmed', 'draft']);
	assert.throws(() => setEntryStatus(LOG, 'zz', 'confirmed'), /No entry/);
	assert.throws(() => setEntryStatus(LOG.replace('id:: b2', 'id:: a1'), 'a1', 'confirmed'), /more than once/);
});

test('replaceEntry round-trips and keeps the rest of the file', () => {
	const [first, second] = parseEntries('', LOG);
	const input = { ...entryInput(first), title: 'First, edited', status: 'confirmed' };
	const out = replaceEntry(LOG, 'a1', input);
	const [edited, untouched] = parseEntries('', out);

	assert.equal(edited.title, 'First, edited');
	assert.equal(edited.status, 'confirmed');
	assert.equal(edited.fields.source, 'notes');
	assert.equal(edited.body, first.body);
	assert.match(edited.body, /## not a heading/);
	assert.deepEqual({ ...untouched, line: 0, end: 0 }, { ...second, line: 0, end: 0 });
	assert.equal(replaceEntry(LOG, 'a1', entryInput(first)).split('\n## 2026-10-02')[1], LOG.split('\n## 2026-10-02')[1]);
});

test('formatEntry escapes body lines that would break the entry', () => {
	const input = { id: 'c3', date: '2026-10-03', title: 'T', status: 'draft', fields: {}, links: [{ target: 'F', id: 'x', text: 'A | B ]]' }], body: '## Heading\nkey:: value\n---' };
	const [entry] = parseEntries('', formatEntry(input));

	assert.equal(entry.fields.key, undefined);
	assert.deepEqual(entry.links.map((link) => [link.id, link.text]), [['x', 'A B']]);
	assert.equal(entry.body, '\\## Heading\nkey\\:: value\n---');
});

test('appendEntry and newEntryId', () => {
	const input = { id: newEntryId('2026-10-04', new Set(['20261004-0000']), () => 0.5), date: '2026-10-04', title: 'New', status: 'confirmed', fields: {}, links: [], body: '' };

	assert.equal(input.id, '20261004-8000');
	assert.deepEqual(parseEntries('', appendEntry(LOG, input)).map((entry) => entry.id), ['a1', 'b2', '20261004-8000']);
	assert.equal(appendEntry('', input), `${formatEntry(input)}\n`);
});
