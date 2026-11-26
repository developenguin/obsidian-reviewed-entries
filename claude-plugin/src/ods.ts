// Minimal reader for OpenDocument spreadsheets (.ods): a zip archive whose
// content.xml holds every sheet. Uses Node built-ins only.

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

export interface Cell {
	text: string;
	/** Text of a cell comment, if any. */
	note: string;
}

export interface Sheet {
	name: string;
	rows: Cell[][];
}

/** Read one file from a zip archive via its central directory. */
function unzipEntry(zip: Buffer, name: string): Buffer {
	const endOfDirectory = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

	if (endOfDirectory === -1) {
		throw new Error('Not a zip archive.');
	}

	const entries = zip.readUInt16LE(endOfDirectory + 10);
	let offset = zip.readUInt32LE(endOfDirectory + 16);

	for (let i = 0; i < entries; i++) {
		const method = zip.readUInt16LE(offset + 10);
		const compressedSize = zip.readUInt32LE(offset + 20);
		const nameLength = zip.readUInt16LE(offset + 28);
		const extraLength = zip.readUInt16LE(offset + 30);
		const commentLength = zip.readUInt16LE(offset + 32);
		const localHeader = zip.readUInt32LE(offset + 42);
		const entryName = zip.toString('utf8', offset + 46, offset + 46 + nameLength);

		if (entryName === name) {
			const dataStart = localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
			const data = zip.subarray(dataStart, dataStart + compressedSize);

			return method === 0 ? data : inflateRawSync(data);
		}

		offset += 46 + nameLength + extraLength + commentLength;
	}

	throw new Error(`${name} not found in archive.`);
}

function decodeEntities(text: string): string {
	return text.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, code: string) => {
		const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

		if (code.startsWith('#')) {
			return String.fromCodePoint(code[1] === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
		}

		return named[code.toLowerCase()];
	});
}

/** Plain text of a fragment of <text:p> paragraphs. */
function paragraphsText(xml: string): string {
	const paragraphs = [...xml.matchAll(/<text:(?:p|h)\b[^>]*?(?:\/>|>([\s\S]*?)<\/text:(?:p|h)>)/g)];

	return paragraphs
		.map(([, inner = '']) =>
			decodeEntities(
				inner
					.replace(/<text:s\b[^>]*?text:c="(\d+)"[^>]*\/>/g, (_, count: string) => ' '.repeat(Number(count)))
					.replace(/<text:s\b[^>]*\/>/g, ' ')
					.replace(/<text:tab\b[^>]*\/>/g, '\t')
					.replace(/<text:line-break\b[^>]*\/>/g, '\n')
					.replace(/<[^>]+>/g, ''),
			),
		)
		.join('\n');
}

/** Columns beyond this are ignored; the sheets use at most five. */
const MAX_COLUMNS = 8;

function parseRow(rowXml: string): Cell[] {
	const cells: Cell[] = [];
	const cellPattern = /<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g;

	for (const [, attributes, inner = ''] of rowXml.matchAll(cellPattern)) {
		const repeat = Number(/table:number-columns-repeated="(\d+)"/.exec(attributes)?.[1] ?? 1);
		const noteXml = /<office:annotation\b[\s\S]*?<\/office:annotation>/.exec(inner)?.[0] ?? '';
		const note = paragraphsText(noteXml.replace(/<dc:[^>]*>[\s\S]*?<\/dc:[^>]*>/g, ''));
		const text = paragraphsText(inner.replace(/<office:annotation\b[\s\S]*?<\/office:annotation>/g, ''));

		for (let i = 0; i < repeat && cells.length < MAX_COLUMNS; i++) {
			cells.push({ text, note });
		}
	}

	return cells;
}

export function readOds(path: string): Sheet[] {
	const xml = unzipEntry(readFileSync(path), 'content.xml').toString('utf8');
	const sheets: Sheet[] = [];

	for (const [, name, body] of xml.matchAll(/<table:table table:name="([^"]*)"[^>]*>([\s\S]*?)<\/table:table>/g)) {
		const rows: Cell[][] = [];

		for (const [, rowBody = ''] of body.matchAll(/<table:table-row\b[^>]*?(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
			const cells = parseRow(rowBody);

			// Repeated rows are always empty padding in these sheets: keep one.
			if (cells.some((cell) => cell.text.trim())) {
				rows.push(cells);
			}
		}

		sheets.push({ name: decodeEntities(name), rows });
	}

	return sheets;
}
