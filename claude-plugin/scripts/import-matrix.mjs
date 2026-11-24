// Generated from cli/ by `yarn build:cli`. Do not edit.

// cli/import-matrix.ts
import { existsSync as existsSync2, mkdirSync, readdirSync as readdirSync2, readFileSync as readFileSync3, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname, join as join2 } from "node:path";

// cli/ods.ts
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
function unzipEntry(zip, name) {
  const endOfDirectory = zip.lastIndexOf(Buffer.from([80, 75, 5, 6]));
  if (endOfDirectory === -1) {
    throw new Error("Not a zip archive.");
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
    const entryName2 = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (entryName2 === name) {
      const dataStart = localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
      const data = zip.subarray(dataStart, dataStart + compressedSize);
      return method === 0 ? data : inflateRawSync(data);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${name} not found in archive.`);
}
function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, code) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (code.startsWith("#")) {
      return String.fromCodePoint(code[1] === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
    }
    return named[code.toLowerCase()];
  });
}
function paragraphsText(xml) {
  const paragraphs = [...xml.matchAll(/<text:(?:p|h)\b[^>]*?(?:\/>|>([\s\S]*?)<\/text:(?:p|h)>)/g)];
  return paragraphs.map(
    ([, inner = ""]) => decodeEntities(
      inner.replace(/<text:s\b[^>]*?text:c="(\d+)"[^>]*\/>/g, (_, count) => " ".repeat(Number(count))).replace(/<text:s\b[^>]*\/>/g, " ").replace(/<text:tab\b[^>]*\/>/g, "	").replace(/<text:line-break\b[^>]*\/>/g, "\n").replace(/<[^>]+>/g, "")
    )
  ).join("\n");
}
var MAX_COLUMNS = 8;
function parseRow(rowXml) {
  const cells = [];
  const cellPattern = /<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g;
  for (const [, attributes, inner = ""] of rowXml.matchAll(cellPattern)) {
    const repeat = Number(/table:number-columns-repeated="(\d+)"/.exec(attributes)?.[1] ?? 1);
    const noteXml = /<office:annotation\b[\s\S]*?<\/office:annotation>/.exec(inner)?.[0] ?? "";
    const note = paragraphsText(noteXml.replace(/<dc:[^>]*>[\s\S]*?<\/dc:[^>]*>/g, ""));
    const text = paragraphsText(inner.replace(/<office:annotation\b[\s\S]*?<\/office:annotation>/g, ""));
    for (let i = 0; i < repeat && cells.length < MAX_COLUMNS; i++) {
      cells.push({ text, note });
    }
  }
  return cells;
}
function readOds(path) {
  const xml = unzipEntry(readFileSync(path), "content.xml").toString("utf8");
  const sheets = [];
  for (const [, name, body] of xml.matchAll(/<table:table table:name="([^"]*)"[^>]*>([\s\S]*?)<\/table:table>/g)) {
    const rows = [];
    for (const [, rowBody = ""] of body.matchAll(/<table:table-row\b[^>]*?(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const cells = parseRow(rowBody);
      if (cells.some((cell) => cell.text.trim())) {
        rows.push(cells);
      }
    }
    sheets.push({ name: decodeEntities(name), rows });
  }
  return sheets;
}

// src/model.ts
var STATUSES = ["draft", "confirmed", "rejected"];
function parseConfig(frontmatter2) {
  const fm = frontmatter2 ?? {};
  const dbName = fm["reviewed-db"];
  if (dbName === void 0 || dbName === null) {
    throw new Error("Note has no reviewed-db property.");
  }
  const folder = (key) => {
    const value = fm[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Property ${key} is missing or empty.`);
    }
    return value.trim().replace(/^\/+|\/+$/g, "");
  };
  const coverage = fm["coverage"] ?? "all";
  if (coverage !== "all" && coverage !== "any") {
    throw new Error(`Property coverage must be all or any, not ${String(coverage)}.`);
  }
  const order = fm["order"] ?? [];
  if (!Array.isArray(order)) {
    throw new Error("Property order must be a list.");
  }
  return {
    name: String(dbName),
    itemsFolder: folder("items-folder"),
    entriesFolder: folder("entries-folder"),
    coverage,
    order: order.map(String)
  };
}
function contentLines(text, frontmatter2 = true) {
  const lines = text.split(/\r?\n/);
  const result = [];
  let start = 0;
  if (frontmatter2 && lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    start = end === -1 ? 0 : end + 1;
  }
  let fence = null;
  for (let i = start; i < lines.length; i++) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(lines[i])?.[1];
    const isMarker = marker !== void 0 && (fence === null || marker.startsWith(fence));
    result.push({ line: i, text: lines[i], code: isMarker || fence !== null });
    if (isMarker) {
      fence = fence === null ? marker : null;
    }
  }
  return result;
}
function frontmatterTitle(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const title = match && /^title:[ \t]*(.+?)[ \t]*$/m.exec(match[1])?.[1];
  return title ? title.replace(/^(['"])(.*)\1$/, "$2") : null;
}
var LIST_ITEM = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+(.*)$/;
var BLOCK_ID = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/;
function hasTag(text, tag) {
  return new RegExp(`(^|\\s)#${tag}(\\s|$)`).test(text);
}
function indentWidth(indent) {
  return indent.replace(/\t/g, "    ").length;
}
function parseItems(text) {
  const roots = [];
  const stack = [];
  for (const { line, text: content } of contentLines(text).filter((l) => !l.code)) {
    const match = LIST_ITEM.exec(content);
    if (!match) {
      if (content.trim() && !/^[ \t]/.test(content)) {
        stack.length = 0;
      }
      continue;
    }
    const indent = indentWidth(match[1]);
    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const id = BLOCK_ID.exec(match[2])?.[1];
    let item = null;
    if (id) {
      const body = match[2].replace(BLOCK_ID, "");
      item = {
        id,
        text: body.replace(/(^|\s)#(text-changed|retired)(?=\s|$)/g, "$1").replace(/\s+/g, " ").trim(),
        textChanged: hasTag(body, "text-changed"),
        retired: hasTag(body, "retired"),
        line,
        children: []
      };
      const parent = [...stack].reverse().find((s) => s.item)?.item;
      (parent ? parent.children : roots).push(item);
    }
    stack.push({ indent, item });
  }
  return roots;
}
var ENTRY_HEADING = /^##[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
var OTHER_HEADING = /^#[ \t]/;
var FIELD = /^[ \t]*(?:[-*+][ \t]+)?([A-Za-z][\w-]*)::[ \t]*(.*?)[ \t]*$/;
var WIKILINK = /\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g;
function parseEntries(path, text) {
  const entries = [];
  let current = null;
  const lines = contentLines(text);
  for (const { line, text: content, code } of lines) {
    if (code) {
      if (current) current.body += `${content}
`;
      continue;
    }
    const heading = ENTRY_HEADING.exec(content);
    if (current && (heading || OTHER_HEADING.test(content))) {
      current.end = line;
    }
    if (heading) {
      const dated = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/.exec(heading[1]);
      current = {
        id: "",
        date: dated?.[1] ?? "",
        title: dated?.[2] ?? heading[1],
        status: "",
        links: [],
        fields: {},
        body: "",
        path,
        line,
        end: line + 1
      };
      entries.push(current);
      continue;
    }
    if (OTHER_HEADING.test(content)) {
      current = null;
      continue;
    }
    const field = current && FIELD.exec(content);
    if (current && !field) {
      current.body += `${content}
`;
    }
    if (!current || !field) {
      continue;
    }
    const key = field[1].toLowerCase();
    const value = field[2];
    current.fields[key] = current.fields[key] ? `${current.fields[key]}, ${value}` : value;
    if (key === "items") {
      for (const link of value.matchAll(WIKILINK)) {
        const [target, blockId] = link[1].split("#^");
        current.links.push({ target, id: blockId ?? null, text: link[2] ?? target });
      }
    }
  }
  if (current) {
    current.end = (lines.at(-1)?.line ?? 0) + 1;
  }
  for (const entry of entries) {
    entry.id = entry.fields["id"] ?? "";
    entry.status = (entry.fields["status"] ?? "").toLowerCase();
    entry.body = entry.body.trim();
  }
  return entries;
}
var collator = new Intl.Collator(void 0, { numeric: true, sensitivity: "base" });
function inFolder(path, folder) {
  return path.startsWith(`${folder}/`);
}
function newNode(key, kind, label, path, line = 0) {
  return { key, kind, label, trail: [], path, line, textChanged: false, retired: false, children: [], entries: [], covered: false, confirmed: 0, drafts: 0 };
}
function buildDb(config, files) {
  const warnings = [];
  const root = newNode("", "group", config.name, "");
  const groups = /* @__PURE__ */ new Map([["", root]]);
  const itemsById = /* @__PURE__ */ new Map();
  const group = (folder) => {
    const existing = groups.get(folder);
    if (existing) {
      return existing;
    }
    const slash = folder.lastIndexOf("/");
    const node = newNode(folder, "group", folder.slice(slash + 1), folder);
    group(slash === -1 ? "" : folder.slice(0, slash)).children.push(node);
    groups.set(folder, node);
    return node;
  };
  const addItems = (parent, items, path) => {
    for (const item of items) {
      const node = newNode(item.id, "item", item.text, path, item.line);
      node.textChanged = item.textChanged;
      node.retired = parent.retired || item.retired;
      parent.children.push(node);
      const first = itemsById.get(item.id);
      if (first) {
        const message = `"${item.text}" (${parent.label}) has the same ID as "${first.label}"`;
        warnings.push({ kind: "Duplicate ID", message, path, line: item.line });
      } else {
        itemsById.set(item.id, node);
      }
      if (item.textChanged && !node.retired) {
        warnings.push({ kind: "Text changed", message: `"${item.text}" (${parent.label})`, path, line: item.line });
      }
      addItems(node, item.children, path);
    }
  };
  const entryFiles = [];
  for (const file of files) {
    if (!file.path.endsWith(".md")) {
      continue;
    }
    if (inFolder(file.path, config.entriesFolder)) {
      entryFiles.push(file);
      continue;
    }
    if (!inFolder(file.path, config.itemsFolder)) {
      continue;
    }
    const relative = file.path.slice(config.itemsFolder.length + 1);
    const slash = relative.lastIndexOf("/");
    const parent = group(slash === -1 ? "" : relative.slice(0, slash));
    const basename = relative.slice(slash + 1, -".md".length);
    const fileNode = newNode(file.path, "group", frontmatterTitle(file.text) ?? basename, file.path);
    parent.children.push(fileNode);
    addItems(fileNode, parseItems(file.text), file.path);
  }
  for (const [folder, node] of groups) {
    node.path = node.key = folder ? `${config.itemsFolder}/${folder}` : config.itemsFolder;
  }
  const entries = attachEntries(entryFiles, itemsById, warnings);
  const rank = (node) => {
    const index = config.order.findIndex((name) => name === node.label || node.path.endsWith(`/${name}.md`));
    return index === -1 ? config.order.length : index;
  };
  const sortGroups = (node) => {
    if (node.kind === "item" || node.path.endsWith(".md")) {
      return;
    }
    node.children.sort((a, b) => rank(a) - rank(b) || collator.compare(a.label, b.label));
    node.children.forEach(sortGroups);
  };
  setTrails(root, null);
  sortGroups(root);
  const retired = extractRetired(root);
  prune(root);
  finish(root, config.coverage);
  retired.forEach((node) => finish(node, config.coverage));
  return { root, retired, itemsById, entries, warnings, leaves: countLeaves(root) };
}
function entryName(entry) {
  return `${entry.date} ${entry.title}`.trim() || "Untitled entry";
}
function attachEntries(files, itemsById, warnings) {
  const entries = [];
  const byId = /* @__PURE__ */ new Map();
  for (const file of files) {
    for (const entry of parseEntries(file.path, file.text)) {
      const where = { path: entry.path, line: entry.line };
      const name = entryName(entry);
      const first = byId.get(entry.id);
      entries.push(entry);
      if (!entry.id) {
        warnings.push({ kind: "Missing ID", message: `${name} has no id`, ...where });
      } else if (first) {
        warnings.push({ kind: "Duplicate ID", message: `${name} has the same id as ${entryName(first)}`, ...where });
      } else {
        byId.set(entry.id, entry);
      }
      if (!STATUSES.includes(entry.status)) {
        const status = entry.status ? `status "${entry.status}"` : "no status";
        warnings.push({ kind: "Invalid status", message: `${name} has ${status}`, ...where });
      }
      if (!entry.links.length) {
        warnings.push({ kind: "No items", message: `${name} links to no items`, ...where });
      }
      for (const link of entry.links) {
        const node = link.id === null ? void 0 : itemsById.get(link.id);
        if (link.id === null) {
          warnings.push({ kind: "Unresolved link", message: `${name} links to "${link.text}", which is not an item`, ...where });
        } else if (!node) {
          warnings.push({ kind: "Broken link", message: `${name} links to "${link.text}", which no longer exists`, ...where });
        } else if (!node.entries.includes(entry)) {
          node.entries.push(entry);
          if (node.retired && entry.status !== "rejected") {
            warnings.push({ kind: "Retired link", message: `${name} links to "${node.label}", which is retired`, ...where });
          }
        }
      }
    }
  }
  return entries;
}
function prune(node) {
  node.children = node.children.filter((child) => child.kind === "item" || prune(child));
  return node.children.length > 0;
}
function setTrails(node, trail) {
  node.trail = trail ?? [];
  const childTrail = trail === null ? [] : [...trail, node.label];
  node.children.forEach((child) => setTrails(child, childTrail));
}
function extractRetired(node) {
  const retired = node.children.filter((child) => child.retired);
  node.children = node.children.filter((child) => !child.retired);
  return [...retired, ...node.children.flatMap(extractRetired)];
}
function finish(node, rule) {
  const subtree = new Set(node.entries);
  for (const child of node.children) {
    finish(child, rule).forEach((entry) => subtree.add(entry));
  }
  for (const entry of subtree) {
    if (entry.status === "confirmed") node.confirmed++;
    if (entry.status === "draft") node.drafts++;
  }
  if (node.children.length === 0) {
    node.covered = node.entries.some((entry) => entry.status === "confirmed");
  } else if (rule === "all") {
    node.covered = node.children.every((child) => child.covered);
  } else {
    node.covered = node.children.some((child) => child.covered);
  }
  return subtree;
}
function countLeaves(node) {
  if (node.children.length === 0) {
    return { covered: node.covered ? 1 : 0, total: node.kind === "item" ? 1 : 0 };
  }
  return node.children.map(countLeaves).reduce((a, b) => ({ covered: a.covered + b.covered, total: a.total + b.total }));
}

// cli/vault.ts
import { existsSync, readdirSync, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var SETTINGS_FILE = join(homedir(), ".operator.json");
function fail(message) {
  console.error(message);
  process.exit(1);
}
function location() {
  const fromEnv = process.env.OPERATOR_VAULT;
  if (fromEnv) {
    return { vault: fromEnv, folder: process.env.OPERATOR_FOLDER ?? "Evidence" };
  }
  if (!existsSync(SETTINGS_FILE)) {
    fail(`No tracker set up: ${SETTINGS_FILE} is missing. Run \`tracker init --vault <path>\` first.`);
  }
  const settings = JSON.parse(readFileSync2(SETTINGS_FILE, "utf8"));
  if (!settings.vault || !settings.folder) {
    fail(`${SETTINGS_FILE} needs "vault" and "folder".`);
  }
  return { vault: settings.vault, folder: settings.folder };
}
function notes(folder) {
  return {
    database: `${folder}/Overview.md`,
    config: `${folder}/Config.md`,
    source: `${folder}/Source`,
    routine: `${folder}/Routine.md`
  };
}
function frontmatter(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const result = {};
  let listKey = null;
  for (const line of block.split(/\r?\n/)) {
    const item = /^\s+-\s+(.*?)\s*$/.exec(line);
    if (item && listKey) {
      result[listKey].push(unquote(item[1]));
      continue;
    }
    const pair = /^([\w-]+):\s*(.*?)\s*$/.exec(line);
    if (!pair) {
      continue;
    }
    const [, key, value] = pair;
    if (value === "" || value === "[]") {
      result[key] = [];
      listKey = key;
    } else {
      result[key] = unquote(value);
      listKey = null;
    }
  }
  return result;
}
function unquote(value) {
  return value.replace(/^(['"])(.*)\1$/, "$2");
}
function setProperty(text, key, value) {
  const [, block, rest] = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/.exec(text) ?? fail("The note has no frontmatter.");
  const lines = block.split(/\r?\n/);
  const replacement = Array.isArray(value) ? value.length ? [`${key}:`, ...value.map((item) => `  - ${JSON.stringify(item)}`)] : [`${key}: []`] : [`${key}: ${value}`];
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
  return `---
${lines.join("\n")}
---${rest ?? "\n"}`;
}
var Vault = class {
  root;
  folder;
  notes;
  constructor(where = location()) {
    this.root = where.vault;
    this.folder = where.folder;
    const base = notes(where.folder);
    const guidelines = existsSync(join(this.root, base.config)) ? frontmatter(readFileSync2(join(this.root, base.config), "utf8")).guidelines : "";
    this.notes = { ...base, guidelines: `${where.folder}/${typeof guidelines === "string" && guidelines ? guidelines : "Guidelines.md"}` };
  }
  path(note) {
    return join(this.root, note);
  }
  read(note) {
    return readFileSync2(this.path(note), "utf8");
  }
  write(note, text) {
    writeFileSync(this.path(note), text);
  }
  settings() {
    return frontmatter(this.read(this.notes.config));
  }
  setting(key) {
    const value = this.settings()[key];
    return typeof value === "string" ? value : "";
  }
  list(key) {
    const value = this.settings()[key];
    return Array.isArray(value) ? value : value ? [value] : [];
  }
  markdownFiles(folder) {
    return readdirSync(this.path(folder), { withFileTypes: true }).flatMap((entry) => {
      const path = `${folder}/${entry.name}`;
      if (entry.isDirectory()) {
        return this.markdownFiles(path);
      }
      return path.endsWith(".md") ? [{ path, text: this.read(path) }] : [];
    });
  }
  load() {
    const config = parseConfig(frontmatter(this.read(this.notes.database)));
    const files = [...this.markdownFiles(config.itemsFolder), ...this.markdownFiles(config.entriesFolder)];
    return { config, db: buildDb(config, files) };
  }
  /** Block IDs linked from the `focus` property in Config.md. */
  focusIds() {
    return new Set(this.list("focus").flatMap((value) => [...value.matchAll(/#\^([A-Za-z0-9-]+)/g)].map((match) => match[1])));
  }
};

// cli/import-matrix.ts
var vault = new Vault();
var STATEMENTS = vault.path(vault.load().config.itemsFolder);
var GUIDELINES_NAME = "Rating guidelines.md";
var GUIDELINES = vault.path(`${vault.folder}/${GUIDELINES_NAME}`);
var CULTURE_SHEET = "Culture Score";
var GUIDELINES_SHEET = "Session details";
function sourceSheet() {
  const folder = vault.path(vault.notes.source);
  const sheets = existsSync2(folder) ? readdirSync2(folder).filter((name) => name.toLowerCase().endsWith(".ods")) : [];
  if (sheets.length !== 1) {
    fail(`Put exactly one .ods export of the Matrix Reloaded sheet in ${vault.notes.source}/ (found ${sheets.length}).`);
  }
  return join2(folder, sheets[0]);
}
var dryRun = process.argv.includes("--dry-run");
var report = {
  new: [],
  changed: [],
  moved: [],
  retired: [],
  restored: [],
  ids: [],
  written: []
};
function normalise(text) {
  return text.replace(/\s+/g, " ").trim();
}
function configValue(key) {
  return vault.setting(key) || fail(`${key} is missing in ${vault.notes.config}.`);
}
function initials(name) {
  return name.split(/[\s&-]+/).filter(Boolean).map((word) => word[0].toLowerCase()).join("");
}
function describeSheet(name) {
  if (normalise(name) === CULTURE_SHEET) {
    return { folder: "Culture", prefix: "cu" };
  }
  const match = /^(.+?)\s*-\s*(\w+)\s*\((\d+)\)$/.exec(normalise(name));
  if (!match) {
    throw new Error(`Unexpected sheet name: ${name}`);
  }
  const [, profile, step, level] = match;
  return { folder: `${profile} ${step}`, prefix: `${profile[0]}${step[0]}${level}`.toLowerCase() };
}
function readProfile(sheet) {
  const { folder, prefix } = describeSheet(sheet.name);
  const dimensions = [];
  for (const row of sheet.rows.slice(1)) {
    const [label, statement] = row;
    if (/score$/i.test(label?.text.trim() ?? "")) {
      continue;
    }
    if (label?.text.trim()) {
      const [name, ...question] = label.text.split(":");
      dimensions.push({ name: normalise(name), question: normalise(question.join(":")), note: label.note.trim(), statements: [] });
    }
    const dimension = dimensions.at(-1);
    if (dimension && statement?.text.trim()) {
      const position = dimension.statements.length + 1;
      dimension.statements.push({
        id: `${prefix}-${initials(dimension.name)}${position}`,
        text: normalise(statement.text),
        note: statement.note.trim()
      });
    }
  }
  return { folder, sheet: normalise(sheet.name), dimensions };
}
var TOP_ITEM = /^[-*+][ \t]+(.*?)[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/;
var NESTED_ITEM = /^([ \t]+)([-*+]|\d+[.)])[ \t]+(.*?)[ \t]*$/;
var BLOCK_ID2 = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/;
var RETIRED = /[ \t]#retired(?=\s|$)/;
function retire(head) {
  return RETIRED.test(head) ? head : head.replace(BLOCK_ID2, " #retired$&");
}
function readBlocks(text) {
  const blocks = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const top = TOP_ITEM.exec(line);
    if (top) {
      current = { id: top[2], text: normalise(top[1].replace(/(^|\s)#(text-changed|retired)(?=\s|$)/g, " ")), head: line, children: [] };
      blocks.push(current);
      continue;
    }
    if (current && (line.trim() === "" || /^[ \t]/.test(line))) {
      current.children.push(line);
      continue;
    }
    current = null;
  }
  for (const block of blocks) {
    while (block.children.length && block.children.at(-1)?.trim() === "") {
      block.children.pop();
    }
  }
  return blocks;
}
function assignFacetIds(block, dimensionPath) {
  const used = new Set(block.children.map((line) => BLOCK_ID2.exec(line)?.[1]).filter(Boolean));
  let letter = 0;
  const nextId = () => {
    let id;
    do {
      id = `${block.id}${String.fromCharCode(97 + letter++)}`;
    } while (used.has(id));
    used.add(id);
    return id;
  };
  return block.children.map((line) => {
    const nested = NESTED_ITEM.exec(line);
    if (!nested || BLOCK_ID2.test(line) || !nested[3]) {
      return line;
    }
    const id = nextId();
    report.ids.push(`${dimensionPath}: "${nested[3]}" \u2192 ^${id}`);
    return `${line.trimEnd()} ^${id}`;
  });
}
function callout(type, title, body) {
  return [`> [!${type}]${body.length ? "-" : ""} ${title}`, ...body.map((line) => line ? `> ${line}` : ">")];
}
function sheetNotes(dimension) {
  const body = [];
  if (dimension.note) {
    body.push(...dimension.note.split("\n"));
  }
  dimension.statements.forEach((statement, index) => {
    if (statement.note) {
      body.push("", `**Statement ${index + 1}:** ${normalise(statement.note)}`);
    }
  });
  return body.length ? ["", ...callout("info", "Sheet notes", body[0] === "" ? body.slice(1) : body)] : [];
}
function renderDimension(profile, dimension, existing, path) {
  const byId = new Map(existing.map((block) => [block.id, block]));
  const byText = new Map(existing.map((block) => [block.text, block.id]));
  const sheetIds = new Set(dimension.statements.map((statement) => statement.id));
  const lines = [
    "---",
    `title: ${dimension.name}`,
    `profile: ${profile.sheet}`,
    "---",
    "",
    "%% Managed by the importer. Edit only the facet bullets under each statement; new bullets get an ID on the next import. Other edits are overwritten. %%"
  ];
  if (dimension.question) {
    lines.push("", ...callout("question", dimension.question, []));
  }
  lines.push(...sheetNotes(dimension), "");
  for (const statement of dimension.statements) {
    const block = byId.get(statement.id);
    const movedFrom = byText.get(statement.text);
    if (movedFrom && movedFrom !== statement.id) {
      report.moved.push(`${path}: "${statement.text}" was ^${movedFrom}, is now position ^${statement.id}. Evidence stays on ^${movedFrom}.`);
    }
    if (!block) {
      report.new.push(`${path}: ^${statement.id} ${statement.text}`);
      lines.push(`- ${statement.text} ^${statement.id}`);
      continue;
    }
    if (block.text === statement.text) {
      if (RETIRED.test(block.head)) {
        report.restored.push(`${path}: ^${statement.id} ${statement.text}`);
      }
      lines.push(block.head.replace(RETIRED, ""));
    } else {
      report.changed.push(`${path}: ^${statement.id}
    was: ${block.text}
    now: ${statement.text}`);
      lines.push(`- ${statement.text} #text-changed ^${statement.id}`);
    }
    lines.push(...assignFacetIds(block, path));
  }
  const removed = existing.filter((block) => !sheetIds.has(block.id));
  if (removed.length) {
    lines.push("", "%% Retired: no longer in the sheet. Kept so linked evidence keeps resolving. %%", "");
    for (const block of removed) {
      if (!RETIRED.test(block.head)) {
        report.retired.push(`${path}: ^${block.id} ${block.text}`);
      }
      lines.push(retire(block.head), ...assignFacetIds(block, path));
    }
  }
  return `${lines.join("\n")}
`;
}
function statementFiles(folder = "") {
  const absolute = join2(STATEMENTS, folder);
  if (!existsSync2(absolute)) {
    return [];
  }
  return readdirSync2(absolute, { withFileTypes: true }).flatMap((entry) => {
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return statementFiles(path);
    }
    return path.endsWith(".md") ? [path] : [];
  });
}
function retireFile(text, path) {
  return text.split("\n").map((line) => {
    const top = TOP_ITEM.exec(line);
    if (!top || RETIRED.test(line)) {
      return line;
    }
    report.retired.push(`${path}: ^${top[2]} ${normalise(top[1])}`);
    return retire(line);
  }).join("\n");
}
function renderGuidelines(sheets) {
  const sheet = sheets.find((candidate) => normalise(candidate.name) === GUIDELINES_SHEET);
  const rows = (sheet?.rows ?? []).map((row) => normalise(row[0]?.text ?? "")).filter(Boolean);
  const start = rows.findIndex((text) => /^guidelines$/i.test(text));
  if (start === -1) {
    throw new Error(`No "Guidelines" row in the ${GUIDELINES_SHEET} sheet.`);
  }
  return [
    "# Rating guidelines",
    "",
    `%% Managed by the importer, from the ${GUIDELINES_SHEET} sheet. Edits are overwritten. %%`,
    "",
    ...rows.slice(start + 1).map((text) => `- ${text}`),
    ""
  ].join("\n");
}
function main() {
  const sheets = readOds(sourceSheet());
  const wanted = [configValue("base-profile"), configValue("growth-profile"), CULTURE_SHEET].map(normalise);
  const outputs = /* @__PURE__ */ new Map();
  const order = [];
  for (const name of wanted) {
    const sheet = sheets.find((candidate) => normalise(candidate.name) === name);
    if (!sheet) {
      throw new Error(`Sheet "${name}" not found. Sheets: ${sheets.map((s) => normalise(s.name)).join(", ")}`);
    }
    const profile = readProfile(sheet);
    order.push(profile.folder, ...profile.dimensions.map((dimension) => dimension.name));
    for (const dimension of profile.dimensions) {
      const path = `${profile.folder}/${dimension.name}.md`;
      const file = join2(STATEMENTS, path);
      const existing2 = existsSync2(file) ? readBlocks(readFileSync3(file, "utf8")) : [];
      outputs.set(path, renderDimension(profile, dimension, existing2, path));
    }
  }
  const managed = (path) => /^profile:/m.test(readFileSync3(join2(STATEMENTS, path), "utf8").split(/^---$/m)[1] ?? "");
  for (const path of statementFiles().filter(managed)) {
    if (!outputs.has(path)) {
      outputs.set(path, retireFile(readFileSync3(join2(STATEMENTS, path), "utf8"), path));
    }
  }
  const allIds = /* @__PURE__ */ new Map();
  for (const [path, output] of outputs) {
    const flatten = (item) => [item, ...item.children.flatMap(flatten)];
    for (const item of parseItems(output).flatMap(flatten)) {
      if (allIds.has(item.id)) {
        throw new Error(`Duplicate ID ^${item.id} in ${path} and ${allIds.get(item.id)}.`);
      }
      allIds.set(item.id, path);
    }
  }
  for (const [path, output] of outputs) {
    const file = join2(STATEMENTS, path);
    if (existsSync2(file) && readFileSync3(file, "utf8") === output) {
      continue;
    }
    report.written.push(path);
    if (!dryRun) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync2(file, output);
    }
  }
  const guidelines = renderGuidelines(sheets);
  if (!existsSync2(GUIDELINES) || readFileSync3(GUIDELINES, "utf8") !== guidelines) {
    report.written.push(GUIDELINES_NAME);
    if (!dryRun) {
      writeFileSync2(GUIDELINES, guidelines);
    }
  }
  if (vault.setting("guidelines") !== GUIDELINES_NAME) {
    report.written.push(`guidelines in ${vault.notes.config}`);
    if (!dryRun) {
      vault.write(vault.notes.config, setProperty(vault.read(vault.notes.config), "guidelines", GUIDELINES_NAME));
    }
  }
  const database = vault.notes.database;
  const current = frontmatter(vault.read(database)).order;
  const existing = Array.isArray(current) ? current : current ? [current] : [];
  const unique = [.../* @__PURE__ */ new Set([...order, ...existing])];
  const ordered = setProperty(vault.read(database), "order", unique);
  if (ordered !== vault.read(database)) {
    report.written.push(`order in ${database}`);
    if (!dryRun) {
      vault.write(database, ordered);
    }
  }
  const sections = [
    ["new", "New statements (need facets)"],
    ["changed", "Changed statements (tagged #text-changed: review their facets)"],
    ["moved", "Possibly moved statements"],
    ["retired", "Retired (no longer in the sheet or profile): tagged #retired, evidence kept"],
    ["restored", "Back in the sheet: #retired removed"],
    ["ids", "Facet IDs assigned"],
    ["written", dryRun ? "Files that would change" : "Files written"]
  ];
  for (const [key, title] of sections) {
    if (report[key].length) {
      console.log(`${title}: ${report[key].length}`);
      report[key].forEach((line) => console.log(`  ${line}`));
    }
  }
  console.log(`Done: ${allIds.size} items (retired included), ${wanted.length} profiles.${dryRun ? " (dry run)" : ""}`);
}
main();
