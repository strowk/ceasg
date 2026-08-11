/*
 * Ported from Mermaid Flow (obsidian-mermaid-flow)
 *   https://github.com/THANSHEER/obsidian-mermaid-flow
 * Copyright (C) THANSHEER and Mermaid Flow contributors.
 * Licensed under GPL-3.0-or-later. Adapted for the ceasg VS Code extension
 * (2026): import paths and a DOM accessor shim; core logic unchanged.
 */

/*
 * Mermaid flowchart -> DiagramModel.
 *
 * This is a focused, line-based parser for the common flowchart / graph subset
 * (the MVP scope). It is intentionally forgiving: anything it cannot interpret
 * is preserved in `model.extras` and re-emitted on save, so we never corrupt a
 * user's advanced syntax.
 */

import {
	DiagramEdge,
	DiagramGroup,
	DiagramModel,
	DiagramNode,
	Direction,
	EdgeKind,
	EdgeStyle,
	LabelFormat,
	NodeShape,
	NodeStyle,
	emptyModel,
	newEdgeId,
	newGroupId,
} from "./model";
import { lookupShape } from "./shapes";
import { warn } from "./diagnostics";

export interface ParseResult {
	model: DiagramModel;
	warnings: string[];
}

const HEADER_RE = /^\s*(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/i;

// Position hint comment we write ourselves so manual layout survives a round
// trip. Mermaid treats `%%` lines as comments, so this stays valid.
const POS_RE = /^\s*%%\s*mermaid-flow:pos\s+(.*)$/i;
const GPOS_RE = /^\s*%%\s*mermaid-flow:gpos\s+(.*)$/i;

/** Operators, longest/most-specific first so the regex matches greedily. */
const LINK_OP_RE = /(<-->|-\.->|-\.-|-->|---|==>|===|~~~)/;
const LINK_OP_RE_G = /(<-->|-\.->|-\.-|-->|---|==>|===|~~~)/g;

function opToKind(op: string): EdgeKind {
	if (op.startsWith("<")) return "bidirectional";
	if (op.startsWith("~")) return "invisible";
	if (op.startsWith("-.")) return "dotted";
	if (op.startsWith("==") || op === "===") return "thick";
	if (op === "---") return "open";
	return "arrow";
}

/** A quoted Mermaid string, unwrapped. `markdown` is set for the backtick-
 *  wrapped markdown-string form, `"`**bold**`"`, whose contents get markdown
 *  emphasis and word wrapping rather than plain-with-HTML treatment. */
interface ParsedString {
	text: string;
	markdown?: boolean;
}

function stripQuotesEx(s: string): ParsedString {
	const t = s.trim();
	let inner = t;
	let quoted = false;
	if (inner.length >= 2 && inner.startsWith('"') && inner.endsWith('"')) {
		inner = inner.slice(1, -1);
		quoted = true;
	}
	let markdown = false;
	// Only a quoted string can be a markdown string. In an unquoted label
	// Mermaid renders backticks as literal text, so unwrapping them there would
	// silently promote `A[`code`]` to a real markdown string on save.
	if (quoted && inner.length >= 2 && inner.startsWith("`") && inner.endsWith("`")) {
		inner = inner.slice(1, -1);
		markdown = true;
	}
	// Decode <br/> back to \n for multi-line labels
	const text = inner.replace(/<br\s*\/?>/gi, "\n");
	return markdown ? { text, markdown } : { text };
}

interface ParsedToken {
	id: string;
	shape?: NodeShape;
	label?: string;
	labelFormat?: LabelFormat;
	classes?: string[];
	syntax?: "bracket" | "attr";
	attrs?: Record<string, string>;
	rawShape?: string;
}

/** Parse a single node token such as `A`, `A[Label]`, `B{Decision}`. */
function parseNodeToken(raw: string): ParsedToken | null {
	const token = raw.trim();
	if (!token) return null;

	// `:::class` shorthand. Handled first (recursively) so it composes with
	// every node form, including chains: `A[Label]:::a:::b`. The greedy prefix
	// is safe — a class name can't end with a label's closing bracket.
	const cls = token.match(/^(.*):::([A-Za-z0-9_-]+)$/);
	if (cls && cls[1] !== undefined && cls[2] !== undefined) {
		const inner = parseNodeToken(cls[1]);
		if (inner) {
			return { ...inner, classes: [...(inner.classes ?? []), cls[2]] };
		}
		// Prefix isn't a node (e.g. `A[x:::y]` — the ::: is inside an unquoted
		// label): fall through to the normal shape patterns on the full token.
	}

	// Ordered so multi-character shape brackets are matched before their
	// single-bracket counterparts (e.g. `((( )))` before `(( ))` before `( )`).
	const id = "([A-Za-z0-9_]+)";
	const patterns: Array<{ re: RegExp; shape: NodeShape }> = [
		{ re: new RegExp(`^${id}\\(\\(\\((.*)\\)\\)\\)$`), shape: "dbl-circ" },
		{ re: new RegExp(`^${id}\\(\\((.*)\\)\\)$`), shape: "circle" },
		{ re: new RegExp(`^${id}\\(\\[(.*)\\]\\)$`), shape: "stadium" },
		{ re: new RegExp(`^${id}\\[\\[(.*)\\]\\]$`), shape: "fr-rect" },
		{ re: new RegExp(`^${id}\\[\\((.*)\\)\\]$`), shape: "cyl" },
		{ re: new RegExp(`^${id}\\{\\{(.*)\\}\\}$`), shape: "hex" },
		{ re: new RegExp(`^${id}\\[/(.*)\\\\\\]$`), shape: "trap-b" },
		{ re: new RegExp(`^${id}\\[\\\\(.*)/\\]$`), shape: "trap-t" },
		{ re: new RegExp(`^${id}\\[/(.*)/\\]$`), shape: "lean-r" },
		{ re: new RegExp(`^${id}\\[\\\\(.*)\\\\\\]$`), shape: "lean-l" },
		{ re: new RegExp(`^${id}\\{(.*)\\}$`), shape: "diam" },
		{ re: new RegExp(`^${id}>(.*)\\]$`), shape: "odd" },
		{ re: new RegExp(`^${id}\\[(.*)\\]$`), shape: "rect" },
		{ re: new RegExp(`^${id}\\((.*)\\)$`), shape: "rounded" },
	];

	for (const { re, shape } of patterns) {
		const m = token.match(re);
		if (m && m[1] !== undefined && m[2] !== undefined) {
			const parsed = stripQuotesEx(m[2]);
			const result: ParsedToken = { id: m[1], shape, label: parsed.text, syntax: "bracket" };
			if (parsed.markdown) {
				result.labelFormat = "markdown";
			}
			return result;
		}
	}

	// Mermaid v11 attribute syntax: `A@{shape: diamond, label: "Hi"}`.
	const v11 = token.match(/^([A-Za-z0-9_]+)@\{(.*)\}$/);
	if (v11 && v11[1] !== undefined && v11[2] !== undefined) {
		const props = parseV11Props(v11[2]);
		const shapeName = props.get("shape")?.text;
		const label = props.get("label");
		const result: ParsedToken = { id: v11[1], syntax: "attr" };
		if (shapeName !== undefined) {
			const def = lookupShape(shapeName);
			if (def) {
				result.shape = def.name;
			} else {
				// Draw it as a rect but keep the name so serialization is lossless.
				result.shape = "rect";
				result.rawShape = shapeName;
				warn(
					"unknown-shape",
					shapeName,
					`Unknown Mermaid shape "${shapeName}" on node "${v11[1]}"; drawn as a rectangle.`,
					"The original name is preserved when the diagram is written back.",
				);
			}
		}
		if (label !== undefined) {
			result.label = label.text;
			if (label.markdown) {
				result.labelFormat = "markdown";
			}
		}
		// Everything except shape and label is passed through untouched.
		const attrs: Record<string, string> = {};
		for (const [k, v] of props) {
			if (k !== "shape" && k !== "label") attrs[k] = v.text;
		}
		if (Object.keys(attrs).length > 0) result.attrs = attrs;
		return result;
	}

	// Bare identifier, no shape declared.
	const bare = token.match(/^([A-Za-z0-9_]+)$/);
	if (bare && bare[1] !== undefined) {
		return { id: bare[1] };
	}

	return null;
}

/** Parse the body of `@{…}`: comma-separated key: value pairs, quote-aware. */
function parseV11Props(body: string): Map<string, ParsedString> {
	const props = new Map<string, ParsedString>();
	const parts: string[] = [];
	let cur = "";
	let inQuote = false;
	for (const ch of body) {
		if (ch === '"') inQuote = !inQuote;
		if (ch === "," && !inQuote) {
			parts.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	parts.push(cur);
	for (const part of parts) {
		const m = part.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
		if (m && m[1] !== undefined && m[2] !== undefined) {
			props.set(m[1].toLowerCase(), stripQuotesEx(m[2]));
		}
	}
	return props;
}

/**
 * Split a line on `;` (Mermaid's optional statement terminator), ignoring any
 * `;` inside a quoted string — HTML entities such as `&amp;` are legal label
 * content and must not be mistaken for a statement boundary.
 */
function splitStatements(line: string): string[] {
	const parts: string[] = [];
	let cur = "";
	let inQuote = false;
	for (const ch of line) {
		if (ch === '"') {
			inQuote = !inQuote;
		}
		if (ch === ";" && !inQuote) {
			parts.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	parts.push(cur);
	return parts;
}

/**
 * Split a node segment on `&` (Mermaid multi-node syntax, `A & B --> C`),
 * ignoring `&` inside bracket labels (`A[Tom & Jerry]`) or quotes.
 */
function splitMultiNodes(segment: string): string[] {
	const parts: string[] = [];
	let cur = "";
	let depth = 0;
	let inQuote = false;
	for (const ch of segment) {
		if (ch === '"') inQuote = !inQuote;
		if (!inQuote) {
			if (ch === "(" || ch === "[" || ch === "{") depth++;
			else if (ch === ")" || ch === "]" || ch === "}") depth--;
			else if (ch === "&" && depth === 0) {
				parts.push(cur);
				cur = "";
				continue;
			}
		}
		cur += ch;
	}
	parts.push(cur);
	return parts;
}

/**
 * Normalize Mermaid's "inline label" link forms (`A -- text --> B`) into the
 * pipe-label form (`A -->|text| B`) so the splitter only has to handle one
 * shape of labelled link.
 */
function normalizeInlineLabels(stmt: string): string {
	return stmt
		// bidirectional: <-- text -->
		.replace(/<--\s*([^-|>][^-|]*?)\s*-->/g, "<-->|$1|")
		// thick arrow:  == text ==>
		.replace(/==\s*([^=|>][^=|]*?)\s*==>/g, "==>|$1|")
		// thick open:   == text ===
		.replace(/==\s*([^=|>][^=|]*?)\s*===/g, "===|$1|")
		// dotted arrow: -. text .->
		.replace(/-\.\s*([^.|>][^.|]*?)\s*\.->/g, "-.->|$1|")
		// normal arrow: -- text -->
		.replace(/--\s*([^-|>][^-|]*?)\s*-->/g, "-->|$1|")
		// normal open:  -- text ---
		.replace(/--\s*([^-|>][^-|]*?)\s*---/g, "---|$1|");
}

/** A `key: value` prop with no recognized handler is preserved verbatim. */
type PropHandler<T> = (val: string, style: T) => void;

/** Parses an integer pixel value (`"18px"` or `"18"`); ignored if not a number. */
function parsePx(val: string, set: (n: number) => void): void {
	const n = parseInt(val.replace(/px$/i, ""), 10);
	if (!Number.isNaN(n)) set(n);
}

/**
 * Shared engine behind `parseStyleProps`/`parseEdgeStyleProps`: splits a
 * `key:value,key:value` string, dispatches each pair to its handler, and
 * preserves anything unrecognized in `style.extra` so it round-trips.
 */
function parseProps<T extends { extra?: string[] }>(
	propStr: string,
	handlers: Record<string, PropHandler<T>>,
): T {
	const style = {} as T;
	const extra: string[] = [];
	for (const raw of propStr.split(",")) {
		const part = raw.trim();
		if (!part) continue;
		const idx = part.indexOf(":");
		if (idx === -1) {
			extra.push(part);
			continue;
		}
		const key = part.slice(0, idx).trim().toLowerCase();
		const val = part.slice(idx + 1).trim();
		const handler = handlers[key];
		if (handler) handler(val, style);
		else extra.push(part);
	}
	if (extra.length > 0) style.extra = extra;
	return style;
}

/** Parse `fill:#fff,stroke:#000,color:#111,font-size:18px,font-family:Arial`. */
function parseStyleProps(propStr: string): NodeStyle {
	return parseProps<NodeStyle>(propStr, {
		fill: (v, s) => (s.fillColor = v),
		stroke: (v, s) => (s.strokeColor = v),
		color: (v, s) => (s.textColor = v),
		"font-size": (v, s) => parsePx(v, (n) => (s.fontSize = n)),
		"font-family": (v, s) => (s.fontFamily = v),
		"stroke-width": (v, s) => parsePx(v, (n) => (s.strokeWidth = n)),
		"stroke-dasharray": (v, s) => (s.strokeDasharray = v),
	});
}

/** Merge a `style <id> ...` property string into the node's style. */
function applyStyleProps(node: DiagramNode, propStr: string): void {
	const parsed = parseStyleProps(propStr);
	const style: NonNullable<DiagramNode["style"]> = node.style ?? {};
	if (parsed.fillColor !== undefined) style.fillColor = parsed.fillColor;
	if (parsed.strokeColor !== undefined) style.strokeColor = parsed.strokeColor;
	if (parsed.textColor !== undefined) style.textColor = parsed.textColor;
	if (parsed.fontSize !== undefined) style.fontSize = parsed.fontSize;
	if (parsed.fontFamily !== undefined) style.fontFamily = parsed.fontFamily;
	if (parsed.strokeWidth !== undefined) style.strokeWidth = parsed.strokeWidth;
	if (parsed.strokeDasharray !== undefined)
		style.strokeDasharray = parsed.strokeDasharray;
	if (parsed.extra && parsed.extra.length > 0) {
		style.extra = [...(style.extra ?? []), ...parsed.extra];
	}
	node.style = style;
}

/** Parse a `linkStyle` property string into an EdgeStyle. */
function parseEdgeStyleProps(propStr: string): EdgeStyle {
	return parseProps<EdgeStyle>(propStr, {
		stroke: (v, s) => (s.strokeColor = v),
		"stroke-width": (v, s) => parsePx(v, (n) => (s.strokeWidth = n)),
		"stroke-dasharray": (v, s) => (s.strokeDasharray = v),
		color: (v, s) => (s.textColor = v),
		"font-size": (v, s) => parsePx(v, (n) => (s.fontSize = n)),
	});
}

/** Parse the JSON body of an `init` directive into model.config (best effort). */
function applyInitConfig(model: DiagramModel, jsonBody: string): void {
	let obj: Record<string, unknown>;
	try {
		obj = JSON.parse(jsonBody) as Record<string, unknown>;
	} catch {
		// Mermaid examples often use single quotes; normalize and retry.
		try {
			const normalized = jsonBody
				.replace(/'/g, '"')
				.replace(/([{,]\s*)([A-Za-z0-9_-]+)\s*:/g, '$1"$2":');
			obj = JSON.parse(normalized) as Record<string, unknown>;
		} catch {
			model.extras.push(`%%{init: ${jsonBody}}%%`);
			return;
		}
	}
	if (!obj) return;
	if (typeof obj.theme === "string") model.config.theme = obj.theme;
	if (obj.themeVariables && typeof obj.themeVariables === "object") {
		model.config.themeVariables = obj.themeVariables as Record<string, string>;
		// Background is modelled as its own field, not a raw theme variable.
		const tv = model.config.themeVariables;
		if (typeof tv.background === "string") {
			model.config.background = tv.background;
			delete tv.background;
			if (Object.keys(tv).length === 0) delete model.config.themeVariables;
		}
	}
	const fc = obj.flowchart as Record<string, unknown> | undefined;
	if (fc && typeof fc === "object") {
		if (typeof fc.nodeSpacing === "number") model.config.nodeSpacing = fc.nodeSpacing;
		if (typeof fc.rankSpacing === "number") model.config.rankSpacing = fc.rankSpacing;
	}
}

function isStructuralLine(line: string): boolean {
	const t = line.trim().toLowerCase();
	return (
		t.startsWith("subgraph") ||
		t === "end" ||
		t.startsWith("style ") ||
		t.startsWith("classdef") ||
		t.startsWith("class ") ||
		t.startsWith("click ") ||
		t.startsWith("linkstyle") ||
		t.startsWith("direction ")
	);
}

export function mermaidToModel(text: string): ParseResult {
	const warnings: string[] = [];
	const model = emptyModel("TB");

	const nodeMap = new Map<string, DiagramNode>();
	const posHints = new Map<
		string,
		{ x: number; y: number; w?: number; h?: number }
	>();
	const groupPosHints = new Map<
		string,
		{ x: number; y: number; w: number; h: number }
	>();
	const groupStack: DiagramGroup[] = [];
	const groupedNodes = new Set<string>();
	const linkStyleDirectives: Array<{ index: number; props: string }> = [];
	const clickBindings: Array<{ id: string; target: string; raw: string }> = [];
	// Raw `style <id> <props>` text per id. `style S1 fill:#f00` is how Mermaid
	// styles a *subgraph*, and we only learn that `S1` names a group after the
	// whole document is read — see the reconciliation pass at the end.
	const rawStyleProps = new Map<string, string[]>();

	const ensureNode = (token: ParsedToken): DiagramNode => {
		let node = nodeMap.get(token.id);
		if (!node) {
			node = {
				id: token.id,
				label: token.label ?? token.id,
				labelFormat: token.labelFormat,
				shape: token.shape ?? "rect",
				x: 0,
				y: 0,
				syntax: token.syntax,
				attrs: token.attrs,
				rawShape: token.rawShape,
			};
			nodeMap.set(token.id, node);
			model.nodes.push(node);
		} else {
			// A later, richer declaration wins (e.g. shape/label defined inline
			// in an edge statement after a bare reference).
			if (token.shape) {
				node.shape = token.shape;
				// A shape-carrying token always supersedes any previously stored
				// unknown name — including clearing it when this token's shape is
				// recognised. Otherwise a stale rawShape from an earlier unknown
				// declaration re-emits on save even after the shape was corrected
				// (mirrors setNodeShape's "a recognised shape supersedes..." rule).
				node.rawShape = token.rawShape;
			}
			if (token.label !== undefined) {
				node.label = token.label;
				// The flag belongs to this label, so a plain redeclaration clears it.
				node.labelFormat = token.labelFormat;
			}
			if (token.syntax) node.syntax = token.syntax;
			if (token.attrs) node.attrs = token.attrs;
		}
		for (const c of token.classes ?? []) {
			if (!node.classes?.includes(c)) (node.classes ??= []).push(c);
		}
		// First mention inside a subgraph assigns membership.
		const current = groupStack[groupStack.length - 1];
		if (current && !groupedNodes.has(node.id)) {
			current.nodeIds.push(node.id);
			groupedNodes.add(node.id);
		}
		return node;
	};

	const openGroup = (rest: string): void => {
		let id: string;
		let title: string;
		let titleMarkdown = false;
		let m: RegExpMatchArray | null;
		if (rest === "") {
			id = newGroupId(model);
			title = id;
		} else if ((m = rest.match(/^([A-Za-z0-9_]+)\s*\[(.+)\]$/))) {
			id = m[1] as string;
			const parsed = stripQuotesEx(m[2] as string);
			title = parsed.text;
			titleMarkdown = !!parsed.markdown;
		} else if ((m = rest.match(/^"(.+)"$/))) {
			id = newGroupId(model);
			// Feed the *quoted* form back in: stripQuotesEx only treats backticks
			// as a markdown string when the double quotes were actually there.
			const parsed = stripQuotesEx(m[0]);
			title = parsed.text;
			titleMarkdown = !!parsed.markdown;
		} else if ((m = rest.match(/^([A-Za-z0-9_]+)$/))) {
			id = m[1] as string;
			title = id;
		} else {
			id = newGroupId(model);
			title = rest;
		}
		const parent = groupStack[groupStack.length - 1];
		const group: DiagramGroup = { id, title, nodeIds: [] };
		if (titleMarkdown) {
			group.titleFormat = "markdown";
		}
		if (parent) group.parentId = parent.id;
		model.groups.push(group);
		groupStack.push(group);
	};

	const rawLines = text.replace(/\r\n/g, "\n").split("\n");
	let headerSeen = false;

	for (const rawLine of rawLines) {
		const line = rawLine.replace(/\t/g, "    ");
		const trimmed = line.trim();
		if (trimmed === "") continue;

		// Our own position hint comment.
		const posMatch = line.match(POS_RE);
		if (posMatch && posMatch[1] !== undefined) {
			for (const part of posMatch[1].split(/[;\s]+/)) {
				const m = part.match(
					/^([A-Za-z0-9_]+)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?),(\d+(?:\.\d+)?))?$/,
				);
				if (m && m[1] && m[2] && m[3]) {
					const hint: { x: number; y: number; w?: number; h?: number } = {
						x: parseFloat(m[2]),
						y: parseFloat(m[3]),
					};
					if (m[4] && m[5]) {
						hint.w = parseFloat(m[4]);
						hint.h = parseFloat(m[5]);
					}
					posHints.set(m[1], hint);
				}
			}
			continue;
		}

		// Our own group-geometry hint comment.
		const gposMatch = line.match(GPOS_RE);
		if (gposMatch && gposMatch[1] !== undefined) {
			for (const part of gposMatch[1].split(/\s+/)) {
				const m = part.match(
					/^([A-Za-z0-9_]+)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/,
				);
				if (m) {
					groupPosHints.set(m[1]!, {
						x: parseFloat(m[2]!),
						y: parseFloat(m[3]!),
						w: parseFloat(m[4]!),
						h: parseFloat(m[5]!),
					});
				}
			}
			continue;
		}

		// `%%{init: {...}}%%` config directive.
		const initMatch = trimmed.match(/^%%\{\s*init\s*:\s*(\{[\s\S]*\})\s*\}%%$/i);
		if (initMatch && initMatch[1]) {
			applyInitConfig(model, initMatch[1]);
			continue;
		}

		// Other comments — keep them.
		if (trimmed.startsWith("%%")) {
			model.extras.push(trimmed);
			continue;
		}

		const header = line.match(HEADER_RE);
		if (header && header[1] !== undefined) {
			let dir = header[1].toUpperCase();
			if (dir === "TD") dir = "TB";
			model.direction = dir as Direction;
			headerSeen = true;
			continue;
		}

		// Subgraph open / close.
		const subMatch = trimmed.match(/^subgraph\b\s*(.*)$/i);
		if (subMatch) {
			openGroup((subMatch[1] ?? "").trim());
			continue;
		}
		if (/^end$/i.test(trimmed)) {
			groupStack.pop();
			continue;
		}

		// `style <id> prop:val,...` — fold into the node's style.
		const styleMatch = trimmed.match(/^style\s+([A-Za-z0-9_]+)\s+(.+)$/i);
		if (styleMatch && styleMatch[1] && styleMatch[2]) {
			const node = ensureNode({ id: styleMatch[1] });
			applyStyleProps(node, styleMatch[2]);
			const prev = rawStyleProps.get(styleMatch[1]);
			if (prev) prev.push(styleMatch[2]);
			else rawStyleProps.set(styleMatch[1], [styleMatch[2]]);
			continue;
		}

		// `linkStyle <i>[,<j>...] prop:val,...` — collect; applied after parse.
		const linkMatch = trimmed.match(/^linkStyle\s+([\d,\s]+?)\s+(.+)$/i);
		if (linkMatch && linkMatch[1] && linkMatch[2]) {
			const props = linkMatch[2];
			for (const tok of linkMatch[1].split(/[,\s]+/)) {
				const n = parseInt(tok, 10);
				if (!Number.isNaN(n)) linkStyleDirectives.push({ index: n, props });
			}
			continue;
		}

		// `classDef name[,name2] prop:val,...` — named reusable styles.
		// Malformed variants fall through to isStructuralLine → extras.
		const classDefMatch = trimmed.match(
			/^classDef\s+([A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)*)\s+(.+)$/i,
		);
		if (classDefMatch && classDefMatch[1] && classDefMatch[2]) {
			const style = parseStyleProps(classDefMatch[2]);
			for (const rawName of classDefMatch[1].split(",")) {
				const name = rawName.trim();
				if (!name) continue;
				// Redefinition wins (Mermaid semantics), keeping original order.
				const existing = model.classDefs.find((c) => c.name === name);
				if (existing) existing.style = style;
				else model.classDefs.push({ name, style });
			}
			continue;
		}

		// `class A,B name` — assign a classDef to nodes.
		const classMatch = trimmed.match(
			/^class\s+([A-Za-z0-9_]+(?:\s*,\s*[A-Za-z0-9_]+)*)\s+([A-Za-z0-9_-]+)\s*$/i,
		);
		if (classMatch && classMatch[1] && classMatch[2]) {
			const className = classMatch[2];
			for (const rawId of classMatch[1].split(",")) {
				const id = rawId.trim();
				if (!id) continue;
				const node = ensureNode({ id });
				if (!node.classes?.includes(className)) {
					(node.classes ??= []).push(className);
				}
			}
			continue;
		}

		// `click <id> "<target>"` / `click <id> href "<target>"` — a node hyperlink.
		// Only the clean, fully reproducible forms become node.link; callbacks,
		// tooltips and target-window variants fall through to extras untouched so
		// nothing we cannot re-emit is ever dropped.
		if (/^click\b/i.test(trimmed)) {
			const m = trimmed.match(
				/^click\s+([A-Za-z0-9_]+)\s+(?:href\s+)?"([^"]*)"\s*;?\s*$/i,
			);
			// A non-empty target only: an empty link cannot be re-emitted (the
			// serializer skips blank links), so preserve it verbatim instead.
			if (m && m[1] && m[2]) {
				clickBindings.push({ id: m[1], target: m[2], raw: trimmed });
			} else {
				model.extras.push(trimmed);
			}
			continue;
		}

		if (isStructuralLine(line)) {
			model.extras.push(trimmed);
			warnings.push(`Unsupported line kept as-is: "${trimmed}"`);
			continue;
		}

		// One statement may hold several `;`-separated statements.
		for (const part of splitStatements(trimmed)) {
			const stmt = part.trim();
			if (!stmt) continue;
			parseStatement(stmt, ensureNode, model.edges, warnings, model.extras);
		}
	}

	if (!headerSeen && model.nodes.length === 0 && model.edges.length === 0) {
		warnings.push("No flowchart content detected.");
	}

	// Apply collected linkStyle directives to edges by index.
	for (const { index, props } of linkStyleDirectives) {
		const edge = model.edges[index];
		if (!edge) continue;
		const parsed = parseEdgeStyleProps(props);
		// Lift animated marker out of extra before merging into style
		if (parsed.extra) {
			const animIdx = parsed.extra.indexOf("mermaid-flow-animated:1");
			if (animIdx >= 0) {
				edge.animated = true;
				parsed.extra.splice(animIdx, 1);
				if (parsed.extra.length === 0) delete parsed.extra;
			}
		}
		edge.style = { ...edge.style, ...parsed };
	}

	// Drop groups with no members AND no child groups — unless an edge names the
	// group. `subgraph S1 \n end` plus `S1 --> D` would otherwise drop the group
	// and leave the placeholder node the reconciliation below exists to remove.
	const parents = new Set(
		model.groups.map((g) => g.parentId).filter((p): p is string => !!p),
	);
	const edgeEndpoints = new Set(model.edges.flatMap((e) => [e.from, e.to]));
	model.groups = model.groups.filter(
		(g) => g.nodeIds.length > 0 || parents.has(g.id) || edgeEndpoints.has(g.id),
	);

	// Mermaid lets a subgraph id stand wherever an edge expects a node
	// (`S1 --> D`). The line loop cannot tell the two apart — the edge may be
	// written *before* its `subgraph` block, so the group does not exist yet —
	// and `ensureNode` invents a placeholder. Reconcile once every group is
	// known: drop those placeholders and let the edges, which still carry the
	// id, resolve to the group instead. This runs before the position-hint
	// loops so a stale `pos` hint is never applied to a node that is now gone,
	// and it clears `nodeMap` so a `click <group id>` binding falls through to
	// extras and round-trips verbatim.
	const groupIds = new Set(model.groups.map((g) => g.id));
	for (const phantom of model.nodes.filter((n) => groupIds.has(n.id))) {
		// `style S1 ...` and `class S1 hot` are how Mermaid styles a subgraph, and
		// both routed through `ensureNode` into this phantom. Subgraph styling is
		// not modelled, so preserve the lines verbatim in extras rather than
		// losing them with the node. Class assignments are re-emitted one id per
		// line: any node co-listed on the original `class A,S1 hot` still gets its
		// assignment from the serializer's own grouping, so repeating the combined
		// line here would assign it twice.
		for (const props of rawStyleProps.get(phantom.id) ?? []) {
			model.extras.push(`style ${phantom.id} ${props}`);
		}
		for (const cls of phantom.classes ?? []) {
			model.extras.push(`class ${phantom.id} ${cls}`);
		}
	}
	model.nodes = model.nodes.filter((n) => !groupIds.has(n.id));
	for (const id of groupIds) {
		nodeMap.delete(id);
	}
	for (const group of model.groups) {
		// A subgraph id can also be mentioned inside another subgraph's body.
		group.nodeIds = group.nodeIds.filter((id) => !groupIds.has(id));
	}

	// Apply stored group bounds from gpos hint comments.
	for (const group of model.groups) {
		const hint = groupPosHints.get(group.id);
		if (hint) {
			group.x = hint.x;
			group.y = hint.y;
			group.w = hint.w;
			group.h = hint.h;
		}
	}

	// Apply saved position hints; everything else gets laid out by the caller.
	for (const node of model.nodes) {
		const hint = posHints.get(node.id);
		if (hint) {
			node.x = hint.x;
			node.y = hint.y;
			if (hint.w && hint.h) {
				node.w = hint.w;
				node.h = hint.h;
			}
		}
	}

	// Apply collected click bindings as node hyperlinks. A binding whose target
	// node never appeared keeps its original line in extras (never dropped).
	for (const { id, target, raw } of clickBindings) {
		const node = nodeMap.get(id);
		if (node) node.link = target;
		else model.extras.push(raw);
	}

	return { model, warnings };
}

function parseStatement(
	stmt: string,
	ensureNode: (t: ParsedToken) => DiagramNode,
	edges: DiagramEdge[],
	warnings: string[],
	extras: string[],
): void {
	const normalized = normalizeInlineLabels(stmt);

	if (!LINK_OP_RE.test(normalized)) {
		// No link operator: standalone node declaration(s), possibly `A & B`.
		const segments = splitMultiNodes(normalized);
		const tokens = segments
			.map((t) => parseNodeToken(t))
			.filter((t): t is ParsedToken => t !== null);
		if (tokens.length > 0 && tokens.length === segments.length) {
			for (const token of tokens) ensureNode(token);
		} else {
			extras.push(stmt);
			warnings.push(`Could not parse: "${stmt}"`);
		}
		return;
	}

	// Split into alternating node / operator pieces, preserving the operators.
	const pieces = normalized.split(LINK_OP_RE_G).map((p) => p.trim());
	// pieces = [node, op, node, op, node, ...]

	let prevNodes: DiagramNode[] = [];
	let pendingOp: string | null = null;

	for (let i = 0; i < pieces.length; i++) {
		const piece = pieces[i] ?? "";
		const isOp = i % 2 === 1;

		if (isOp) {
			pendingOp = piece;
			continue;
		}

		// Node piece. It may carry a leading pipe-label belonging to the
		// previous operator: `|label| B`.
		let label = "";
		let labelFormat: LabelFormat | undefined;
		let nodePart = piece;
		const labelMatch = piece.match(/^\|([^|]*)\|\s*(.*)$/);
		if (labelMatch && labelMatch[1] !== undefined && labelMatch[2] !== undefined) {
			const parsed = stripQuotesEx(labelMatch[1]);
			label = parsed.text;
			if (parsed.markdown) {
				labelFormat = "markdown";
			}
			nodePart = labelMatch[2].trim();
		}

		// A segment may name several nodes joined with `&` (`A & B --> C`).
		const tokens = splitMultiNodes(nodePart)
			.map((t) => t.trim())
			.filter((t) => t.length > 0);
		if (tokens.length === 0) {
			extras.push(stmt);
			warnings.push(`Could not parse node "${nodePart}" in "${stmt}"`);
			return;
		}
		const currentNodes: DiagramNode[] = [];
		for (const tk of tokens) {
			const token = parseNodeToken(tk);
			if (!token) {
				extras.push(stmt);
				warnings.push(`Could not parse node "${tk}" in "${stmt}"`);
				return;
			}
			currentNodes.push(ensureNode(token));
		}

		if (prevNodes.length > 0 && pendingOp) {
			// `A & B --> C & D` connects every left node to every right node.
			for (const from of prevNodes) {
				for (const to of currentNodes) {
					edges.push({
						id: newEdgeId(),
						from: from.id,
						to: to.id,
						label,
						labelFormat,
						kind: opToKind(pendingOp),
					});
				}
			}
		}

		prevNodes = currentNodes;
		pendingOp = null;
	}
}
