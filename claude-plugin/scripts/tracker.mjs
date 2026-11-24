// Generated from cli/ by `yarn build:cli`. Do not edit.

// cli/tracker.ts
import { existsSync as existsSync2, mkdirSync, readFileSync as readFileSync2, appendFileSync, writeFileSync as writeFileSync2 } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, join as join2, resolve } from "node:path";

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
function findEntry(text, id) {
  const matches = parseEntries("", text).filter((entry) => entry.id === id);
  if (matches.length !== 1) {
    throw new Error(matches.length ? `Entry ID ${id} is used more than once in this file.` : `No entry with ID ${id} in this file.`);
  }
  return matches[0];
}
function setEntryStatus(text, id, status2) {
  const entry = findEntry(text, id);
  const lines = text.split("\n");
  const statusLine = /^([ \t]*(?:[-*+][ \t]+)?status::[ \t]*).*?(\r?)$/i;
  for (let i = entry.line + 1; i < entry.end; i++) {
    if (statusLine.test(lines[i])) {
      lines[i] = lines[i].replace(statusLine, `$1${status2}$2`);
      return lines.join("\n");
    }
  }
  lines.splice(entry.line + 1, 0, `status:: ${status2}`);
  return lines.join("\n");
}
var collator = new Intl.Collator(void 0, { numeric: true, sensitivity: "base" });
function inFolder(path, folder) {
  return path.startsWith(`${folder}/`);
}
function newNode(key, kind, label, path, line = 0) {
  return { key, kind, label, trail: [], path, line, textChanged: false, retired: false, children: [], entries: [], covered: false, confirmed: 0, drafts: 0 };
}
function buildDb(config2, files) {
  const warnings = [];
  const root = newNode("", "group", config2.name, "");
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
  const addItems = (parent, items2, path) => {
    for (const item of items2) {
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
    if (inFolder(file.path, config2.entriesFolder)) {
      entryFiles.push(file);
      continue;
    }
    if (!inFolder(file.path, config2.itemsFolder)) {
      continue;
    }
    const relative = file.path.slice(config2.itemsFolder.length + 1);
    const slash = relative.lastIndexOf("/");
    const parent = group(slash === -1 ? "" : relative.slice(0, slash));
    const basename = relative.slice(slash + 1, -".md".length);
    const fileNode = newNode(file.path, "group", frontmatterTitle(file.text) ?? basename, file.path);
    parent.children.push(fileNode);
    addItems(fileNode, parseItems(file.text), file.path);
  }
  for (const [folder, node] of groups) {
    node.path = node.key = folder ? `${config2.itemsFolder}/${folder}` : config2.itemsFolder;
  }
  const entries = attachEntries(entryFiles, itemsById, warnings);
  const rank = (node) => {
    const index = config2.order.findIndex((name) => name === node.label || node.path.endsWith(`/${name}.md`));
    return index === -1 ? config2.order.length : index;
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
  finish(root, config2.coverage);
  retired.forEach((node) => finish(node, config2.coverage));
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
      const where2 = { path: entry.path, line: entry.line };
      const name = entryName(entry);
      const first = byId.get(entry.id);
      entries.push(entry);
      if (!entry.id) {
        warnings.push({ kind: "Missing ID", message: `${name} has no id`, ...where2 });
      } else if (first) {
        warnings.push({ kind: "Duplicate ID", message: `${name} has the same id as ${entryName(first)}`, ...where2 });
      } else {
        byId.set(entry.id, entry);
      }
      if (!STATUSES.includes(entry.status)) {
        const status2 = entry.status ? `status "${entry.status}"` : "no status";
        warnings.push({ kind: "Invalid status", message: `${name} has ${status2}`, ...where2 });
      }
      if (!entry.links.length) {
        warnings.push({ kind: "No items", message: `${name} links to no items`, ...where2 });
      }
      for (const link of entry.links) {
        const node = link.id === null ? void 0 : itemsById.get(link.id);
        if (link.id === null) {
          warnings.push({ kind: "Unresolved link", message: `${name} links to "${link.text}", which is not an item`, ...where2 });
        } else if (!node) {
          warnings.push({ kind: "Broken link", message: `${name} links to "${link.text}", which no longer exists`, ...where2 });
        } else if (!node.entries.includes(entry)) {
          node.entries.push(entry);
          if (node.retired && entry.status !== "rejected") {
            warnings.push({ kind: "Retired link", message: `${name} links to "${node.label}", which is retired`, ...where2 });
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
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
  const settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
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
  const [, block, rest2] = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n[\s\S]*)?$/.exec(text) ?? fail("The note has no frontmatter.");
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
---${rest2 ?? "\n"}`;
}
var Vault = class {
  root;
  folder;
  notes;
  constructor(where2 = location()) {
    this.root = where2.vault;
    this.folder = where2.folder;
    const base = notes(where2.folder);
    const guidelines = existsSync(join(this.root, base.config)) ? frontmatter(readFileSync(join(this.root, base.config), "utf8")).guidelines : "";
    this.notes = { ...base, guidelines: `${where2.folder}/${typeof guidelines === "string" && guidelines ? guidelines : "Guidelines.md"}` };
  }
  path(note) {
    return join(this.root, note);
  }
  read(note) {
    return readFileSync(this.path(note), "utf8");
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
    const config2 = parseConfig(frontmatter(this.read(this.notes.database)));
    const files = [...this.markdownFiles(config2.itemsFolder), ...this.markdownFiles(config2.entriesFolder)];
    return { config: config2, db: buildDb(config2, files) };
  }
  /** Block IDs linked from the `focus` property in Config.md. */
  focusIds() {
    return new Set(this.list("focus").flatMap((value) => [...value.matchAll(/#\^([A-Za-z0-9-]+)/g)].map((match) => match[1])));
  }
};

// cli/tracker.ts
var SENSITIVE = [
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]+)/, "API token"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\b(password|passwd|wachtwoord|secret)\s*[:=]/i, "password or secret"],
  [/\b\d{9}\b/, "9-digit number (possible BSN)"],
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/, "email address"]
];
function walk(node, visit, depth = 0) {
  visit(node, depth);
  node.children.forEach((child) => walk(child, visit, depth + 1));
}
function status(node) {
  const counts = [node.confirmed && `${node.confirmed} confirmed`, node.drafts && `${node.drafts} draft`].filter(Boolean);
  return `${node.covered ? "Covered" : "Missing"}${counts.length ? `, ${counts.join(", ")}` : ""}`;
}
function items(json) {
  const vault = new Vault();
  const { db } = vault.load();
  const focus = vault.focusIds();
  const rows = [];
  walk(db.root, (node, depth) => {
    if (depth === 0) {
      return;
    }
    if (json) {
      if (node.kind === "item") {
        rows.push({
          id: node.key,
          text: node.label,
          trail: node.trail,
          leaf: node.children.length === 0,
          covered: node.covered,
          confirmed: node.confirmed,
          drafts: node.drafts,
          focus: focus.has(node.key)
        });
      }
      return;
    }
    const indent = "  ".repeat(depth - 1);
    const label = node.kind === "group" ? `## ${node.label}` : `${node.key} | ${node.label}`;
    console.log(`${indent}${label} [${status(node)}]${focus.has(node.key) ? " [Focus]" : ""}`);
  });
  if (json) {
    console.log(JSON.stringify(rows, null, "	"));
  }
}
function check() {
  const { db } = new Vault().load();
  if (!db.warnings.length) {
    console.log("No warnings.");
  }
  for (const warning of db.warnings) {
    console.log(`${warning.kind}: ${warning.message} (${warning.path}:${warning.line + 1})`);
  }
}
function validate(input, known) {
  const problems = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) {
    problems.push(`date must be YYYY-MM-DD, got ${input.date}`);
  }
  for (const key of ["title", "source", "ref"]) {
    if (!input[key]?.trim()) {
      problems.push(`${key} is empty`);
    }
  }
  if (!input.items?.length) {
    problems.push("items is empty");
  }
  for (const id of input.items ?? []) {
    const node = known.get(id);
    if (!node) {
      problems.push(`unknown item ${id}`);
    } else if (node.retired) {
      problems.push(`item ${id} is retired`);
    }
  }
  if (input.status && input.status !== "draft" && input.status !== "confirmed") {
    problems.push(`status must be draft or confirmed, got ${input.status}`);
  }
  const text = [input.title, input.source, ...input.body ?? []].join("\n");
  for (const [pattern, label] of SENSITIVE) {
    if (pattern.test(text)) {
      problems.push(`looks like it contains a ${label}: rephrase without it`);
    }
  }
  return problems;
}
function render(input, id, known) {
  const links = input.items.map((itemId) => {
    const node = known.get(itemId);
    const alias = node.label.replace(/[|\]]/g, " ");
    return `[[${node.path.replace(/\.md$/, "")}#^${itemId}|${alias}]]`;
  });
  return [
    `## ${input.date} ${input.title.trim()}`,
    `id:: ${id}`,
    `status:: ${input.status ?? "draft"}`,
    `items:: ${links.join(", ")}`,
    `source:: ${input.source.trim()}`,
    `ref:: ${input.ref.trim()}`,
    "",
    ...input.body.map((line) => `- ${line.replace(/^[-*]\s+/, "").trim()}`)
  ].join("\n");
}
function add(source) {
  const raw = readFileSync2(source === "-" ? 0 : source, "utf8");
  const parsed = JSON.parse(raw);
  const inputs = Array.isArray(parsed) ? parsed : [parsed];
  const vault = new Vault();
  const { config: config2, db } = vault.load();
  const known = new Map(db.itemsById);
  const refs = new Set(db.entries.map((entry) => entry.fields["ref"]?.trim()).filter(Boolean));
  const ids = new Set(db.entries.map((entry) => entry.id));
  const problems = inputs.flatMap((input, index) => validate(input, known).map((problem) => `entry ${index + 1}: ${problem}`));
  if (problems.length) {
    fail(`Nothing written.
${problems.join("\n")}`);
  }
  for (const input of inputs) {
    if (refs.has(input.ref.trim())) {
      console.log(`Skipped (already logged): ${input.date} ${input.title}`);
      continue;
    }
    let id;
    do {
      id = `${input.date.replace(/-/g, "")}-${randomBytes(2).toString("hex")}`;
    } while (ids.has(id));
    ids.add(id);
    refs.add(input.ref.trim());
    const month = input.date.slice(0, 7);
    const path = vault.path(`${config2.entriesFolder}/${month}.md`);
    if (!existsSync2(path)) {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `# ${month}
`);
    }
    appendFileSync(path, `
${render(input, id, known)}
`);
    console.log(`Added ${input.status ?? "draft"} ${id}: ${input.date} ${input.title} \u2192 ${config2.entriesFolder}/${month}.md`);
  }
}
function goals(root) {
  const result = [];
  walk(root, (node) => {
    if (node.kind !== "group") {
      return;
    }
    for (const child of node.children.filter((child2) => child2.kind === "item")) {
      const parents = /* @__PURE__ */ new Map();
      walk(child, (descendant) => parents.set(descendant.key, child));
      result.push({ goal: child, parents });
    }
  });
  return result;
}
function leaves(node) {
  return node.children.length ? node.children.flatMap(leaves) : [node];
}
function drafts() {
  const { db } = new Vault().load();
  const goalOf = new Map(goals(db.root).flatMap(({ goal, parents }) => [...parents.keys()].map((key) => [key, goal])));
  const groups = /* @__PURE__ */ new Map();
  for (const entry of db.entries.filter((entry2) => entry2.status === "draft")) {
    const first = entry.links.find((link) => link.id && goalOf.has(link.id));
    const goal = first?.id ? goalOf.get(first.id) : void 0;
    const heading = goal ? `${goal.trail.join(" \u203A ")} \u203A ${goal.label}` : "Not linked to a known goal";
    const lines = [
      `- ${entry.id} | ${entry.date} ${entry.title}`,
      `  items: ${entry.links.map((link) => link.text).join(" \xB7 ")}`,
      ...Object.entries(entry.fields).filter(([key]) => !["id", "status", "items"].includes(key)).map(([key, value]) => `  ${key}: ${value}`),
      ...entry.body.split("\n").map((line) => `  ${line}`)
    ];
    groups.set(heading, [...groups.get(heading) ?? [], ...lines]);
  }
  if (!groups.size) {
    console.log("No drafts.");
  }
  for (const [heading, lines] of groups) {
    console.log(`## ${heading}
${lines.join("\n")}
`);
  }
}
function calloutBody(text, title) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => title.test(line));
  if (start === -1) {
    return [];
  }
  const end = lines.findIndex((line, index) => index > start && !line.startsWith(">"));
  return lines.slice(start + 1, end === -1 ? void 0 : end).map((line) => line.replace(/^> ?/, ""));
}
function goalNotes(vault, path, goalId) {
  const text = vault.read(path);
  const question = /^> \[!question\] (.*)$/m.exec(text)?.[1] ?? "";
  const notes2 = calloutBody(text, /^> \[!info\]-? (Sheet )?[Nn]otes/);
  const perGoal = /^\*\*(\^[A-Za-z0-9-]+|Statement \d+):\*\*/;
  const firstGoal = notes2.findIndex((line) => perGoal.test(line));
  const file = (firstGoal === -1 ? notes2 : notes2.slice(0, firstGoal)).filter((line) => line.trim());
  const position = /(\d+)$/.exec(goalId)?.[1];
  const own = notes2.find((line) => line.startsWith(`**^${goalId}:**`) || line.startsWith(`**Statement ${position}:**`));
  return { question, file, goal: own?.replace(perGoal, "").trim() ?? "" };
}
function explain(ids) {
  if (!ids.length) {
    fail("Usage: tracker explain <id\u2026>");
  }
  const vault = new Vault();
  const { db } = vault.load();
  const goalOf = new Map(goals(db.root).flatMap(({ goal, parents }) => [...parents.keys()].map((key) => [key, goal])));
  const unknown = ids.filter((id) => !goalOf.has(id));
  if (unknown.length) {
    fail(`Unknown item: ${unknown.join(", ")}`);
  }
  const asked = new Set(ids);
  const shown = /* @__PURE__ */ new Set();
  const shownFiles = /* @__PURE__ */ new Set();
  for (const id of ids) {
    const goal = goalOf.get(id);
    if (shown.has(goal.key)) {
      continue;
    }
    shown.add(goal.key);
    const notes2 = goalNotes(vault, goal.path, goal.key);
    const mark = (node) => asked.has(node.key) ? " <<" : "";
    console.log(`## ${goal.trail.join(" / ")}${notes2.question ? `: ${notes2.question}` : ""}`);
    console.log("");
    if (!shownFiles.has(goal.path)) {
      shownFiles.add(goal.path);
      console.log("Notes:");
      console.log(notes2.file.length ? notes2.file.join("\n") : "(none)");
      console.log("");
    }
    console.log(`Goal ^${goal.key}${mark(goal)}: ${goal.label}`);
    console.log(`Goal note: ${notes2.goal || "(none)"}`);
    if (goal.children.length) {
      console.log("Facets:");
      walk(goal, (node, depth) => depth > 0 && console.log(`${"  ".repeat(depth - 1)}- ^${node.key}${mark(node)} ${node.label} (${status(node)})`));
    } else {
      console.log(`Coverage: ${status(goal)}`);
    }
    console.log("");
  }
  const note = vault.notes.guidelines;
  if (existsSync2(vault.path(note))) {
    console.log(`Guidelines (${note}):`);
    console.log(vault.read(note).split(/\r?\n/).filter((line) => line.startsWith("- ")).join("\n"));
  }
}
function setStatus(id, status2) {
  if (!id || !STATUSES.includes(status2 ?? "")) {
    fail("Usage: tracker status <entry id> <draft|confirmed|rejected>");
  }
  const vault = new Vault();
  const { db } = vault.load();
  const entry = db.entries.find((candidate) => candidate.id === id) ?? fail(`No entry with ID ${id}.`);
  const path = vault.path(entry.path);
  writeFileSync2(path, setEntryStatus(readFileSync2(path, "utf8"), id, status2));
  console.log(`${id}: ${entry.status} \u2192 ${status2} (${entry.title})`);
}
function gaps(count) {
  const vault = new Vault();
  const { db } = vault.load();
  const focus = vault.focusIds();
  const recent = new Set(vault.list("recently-asked"));
  const candidates = goals(db.root).map(({ goal }) => {
    const all = leaves(goal).filter((leaf) => !leaf.retired);
    const missing = all.filter((leaf) => !leaf.covered);
    const rank = all.length > 1 && missing.length === 1 ? 0 : goal.confirmed + goal.drafts === 0 ? 1 : 2;
    return { goal, all, missing, rank };
  }).filter(({ goal, missing }) => missing.length && !goal.retired && !focus.has(goal.key) && !recent.has(goal.key)).sort((a, b) => a.rank - b.rank);
  const file = (node) => node.trail.join(" \u203A ");
  const picked = candidates.filter((candidate, index) => candidates.findIndex((other) => file(other.goal) === file(candidate.goal)) === index);
  const chosen = [...picked, ...candidates.filter((candidate) => !picked.includes(candidate))].slice(0, count);
  for (const { goal, all, missing } of chosen) {
    console.log(`${goal.key} | ${goal.trail.join(" \u203A ")} \u203A ${goal.label}`);
    for (const leaf of missing.filter((leaf2) => leaf2 !== goal)) {
      console.log(`  missing: ${leaf.label}`);
    }
    console.log(`  ${all.length - missing.length} of ${all.length} covered`);
  }
}
var LIST_KEYS = ["focus", "recently-asked"];
function config(key, values) {
  const vault = new Vault();
  const note = vault.notes.config;
  if (!key) {
    console.log(JSON.stringify(vault.settings(), null, "	"));
    return;
  }
  if (!values.length) {
    console.log(JSON.stringify(vault.settings()[key] ?? null));
    return;
  }
  const value = LIST_KEYS.includes(key) ? values.length === 1 && values[0] === "[]" ? [] : values : values.join(" ");
  vault.write(note, setProperty(vault.read(note), key, value));
  console.log(`${key} set.`);
}
var WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function schedule(vault) {
  const timezone = vault.setting("timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const days = (vault.setting("review-days") || "Mon Tue Wed Thu Fri").split(/[\s,]+/).map((day) => WEEKDAYS.indexOf(day.slice(0, 3)) + 1).filter((day) => day > 0);
  const [from, to] = (vault.setting("review-hours") || "9-17").split("-").map(Number);
  const [weeklyDay, weeklyHour] = (vault.setting("weekly") || "Fri 14").split(/\s+/);
  return { timezone, days, from, to, weeklyDay: WEEKDAYS.indexOf(weeklyDay.slice(0, 3)) + 1, weeklyHour: Number(weeklyHour ?? 0) };
}
function local(moment, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(moment).map((part) => [part.type, part.value])
  );
  return {
    weekday: WEEKDAYS.indexOf(parts.weekday) + 1,
    hour: Number(parts.hour),
    date: `${parts.year}-${parts.month}-${parts.day}`
  };
}
function reviewWindow() {
  const plan = schedule(new Vault());
  const now = local(/* @__PURE__ */ new Date(), plan.timezone);
  const dayNames = plan.days.map((day) => WEEKDAYS[day - 1]).join(" ");
  if (!plan.days.includes(now.weekday)) {
    console.log(`closed: not a review day (${dayNames})`);
  } else if (now.hour < plan.from || now.hour >= plan.to) {
    console.log(`closed: outside ${plan.from}:00\u2013${plan.to}:00 ${plan.timezone}`);
  } else {
    console.log("open");
  }
}
function health() {
  const vault = new Vault();
  const plan = schedule(vault);
  const problems = [];
  const now = /* @__PURE__ */ new Date();
  const today = local(now, plan.timezone);
  const daysBack = (today.weekday - plan.weeklyDay + 7) % 7 || (today.hour < plan.weeklyHour ? 7 : 0);
  const due = local(new Date(now.getTime() - daysBack * 864e5), plan.timezone).date;
  const weeklyAt = vault.setting("last-weekly-at");
  const weekly = weeklyAt ? local(new Date(weeklyAt), plan.timezone).date : null;
  if (!weekly || weekly < due) {
    problems.push(`weekly: not finished since ${WEEKDAYS[plan.weeklyDay - 1]} ${due} (last: ${weekly ?? "never"})`);
  }
  if (vault.setting("last-mine-status").startsWith("failed")) {
    problems.push(`collect: ${vault.setting("last-mine-status")}`);
  }
  const minedThrough = vault.setting("last-mined-at");
  if (!minedThrough || now.getTime() - new Date(minedThrough).getTime() > 7 * 864e5) {
    problems.push(`collect: nothing collected since ${minedThrough ? minedThrough.slice(0, 10) : "ever"}`);
  }
  const backfilled = vault.setting("backfilled-through") || vault.setting("mining-start");
  const backfillUntil = vault.setting("backfill-until");
  if (backfilled && backfillUntil && new Date(backfilled) < new Date(backfillUntil)) {
    problems.push(`backfill: done through ${backfilled.slice(0, 10)}, needed up to ${backfillUntil.slice(0, 10)}`);
  }
  console.log(problems.length ? problems.join("\n") : "OK");
}
var OVERVIEW = (folder) => `---
reviewed-db: Evidence
items-folder: ${folder}/Goals
entries-folder: ${folder}/Log
coverage: all
order: []
---

\`\`\`reviewed-db
\`\`\`

A goal is covered when every facet has at least one confirmed piece of evidence. Goals without facets need one confirmed piece themselves.
`;
var CONFIG = `---
timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
review-days: Mon Tue Wed Thu Fri
review-hours: 9-17
weekly: Fri 14
focus: []
recently-asked: []
---

# Config

Settings for the evidence tracker. Claude maintains most of them; edit the ones marked as yours.

- **timezone, review-days, review-hours, weekly** (yours): when scheduled reviews may run, and when the weekly part is due (day and hour).
- **focus** (yours): goals to work on this period. Ask Claude to set them.
- **last-mined-at, last-mine-status**: how far scheduled runs have collected activity, and whether the last run worked.
- **mining-start, backfill-until, backfilled-through**: the optional backfill of older history.
- **last-review-at / last-weekly-at**: when the review and the weekly part last finished.
- **recently-asked**: goals the last weekly parts asked about, so questions rotate.
- **base-profile / growth-profile**: only for the Matrix Reloaded importer: sheet names as in the sheet in \`Source/\`, e.g. \`Expert - core (7)\`.
- Goals: see \`Goals/\`. Sources and routine: see \`Routine.md\`.
`;
function init(args) {
  const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : void 0;
  };
  const vaultPath = option("vault") ?? fail("Usage: tracker init --vault <absolute path> [--folder <name>]");
  const folder = option("folder") ?? "Evidence";
  const root = isAbsolute(vaultPath) ? vaultPath : resolve(vaultPath);
  if (!existsSync2(join2(root, ".obsidian"))) {
    fail(`${root} is not an Obsidian vault (no .obsidian folder).`);
  }
  const paths = notes(folder);
  for (const dir of [`${folder}/Goals`, `${folder}/Log`, paths.source]) {
    mkdirSync(join2(root, dir), { recursive: true });
  }
  for (const [note, text] of [
    [paths.database, OVERVIEW(folder)],
    [paths.config, CONFIG]
  ]) {
    if (existsSync2(join2(root, note))) {
      console.log(`Kept existing ${note}`);
    } else {
      writeFileSync2(join2(root, note), text);
      console.log(`Created ${note}`);
    }
  }
  writeFileSync2(SETTINGS_FILE, `${JSON.stringify({ vault: root, folder }, null, "	")}
`);
  console.log(`Saved the location in ${SETTINGS_FILE}`);
}
function where() {
  const vault = new Vault();
  console.log(JSON.stringify({ vault: vault.root, folder: vault.folder, ...vault.notes }, null, "	"));
}
var [command, argument, ...rest] = process.argv.slice(2);
switch (command) {
  case "items":
    items(argument === "--json");
    break;
  case "add":
    add(argument ?? fail("Usage: tracker add <file.json|->"));
    break;
  case "check":
    check();
    break;
  case "drafts":
    drafts();
    break;
  case "status":
    setStatus(argument, rest[0]);
    break;
  case "explain":
    explain([argument, ...rest].filter(Boolean));
    break;
  case "gaps":
    gaps(Number(argument ?? 3));
    break;
  case "config":
    config(argument, rest);
    break;
  case "window":
    reviewWindow();
    break;
  case "init":
    init([argument, ...rest].filter(Boolean));
    break;
  case "where":
    where();
    break;
  case "health":
    health();
    break;
  default:
    fail("Usage: tracker init --vault <path> [--folder <name>] | where | items [--json] | add <file.json|-> | check | drafts | status <id> <status> | explain <id\u2026> | gaps [count] | config [key [value\u2026]] | window | health");
}
