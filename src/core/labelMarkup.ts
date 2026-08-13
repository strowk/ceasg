/*
 * Label markup: Mermaid's two flavours of formatted label, tokenized into
 * styled runs that both the size estimator and the renderer consume.
 *
 * Mermaid defaults to `htmlLabels: true`, so an ordinary quoted string already
 * renders <b>/<i>/<br> and HTML entities. A *markdown string* — the
 * backtick-wrapped form, A["`**bold**`"] — additionally gets markdown emphasis
 * and automatic word wrapping. `markdown` selects between the two.
 *
 * Nothing here ever throws: this runs inside the Markdown preview, where an
 * exception blanks the whole fenced block. Every malformed construct degrades
 * to the literal characters the author typed.
 */

import { BASE_FONT_FAMILY, BASE_FONT_SIZE, measureTextWidth } from "./textMetrics";

export interface LabelRun {
	text: string;
	bold?: boolean;
	italic?: boolean;
}

/** One visual line: the runs it is made of, in reading order. */
export type LabelLine = LabelRun[];

/** Tags we can actually draw in SVG text. Anything else stays literal, because
 *  silently swallowing `A <B> C` is worse than showing the angle brackets. */
const TAG_RE = /^<(\/?)(b|strong|i|em)\s*>/i;

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
	copy: "©", reg: "®", trade: "™", hellip: "…",
	mdash: "—", ndash: "–", laquo: "«", raquo: "»",
	times: "×", divide: "÷", deg: "°", plusmn: "±",
	middot: "·", bull: "•", larr: "←", rarr: "→",
	uarr: "↑", darr: "↓", harr: "↔",
};

/** Decode HTML entities. Runs *after* tag tokenization, so a decoded `<` can
 *  never be re-read as markup. An unknown entity is left exactly as typed. */
function decodeEntities(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
		const named = NAMED_ENTITIES[body.toLowerCase()];
		if (named !== undefined) return named;
		if (body[0] === "#") {
			const code = body[1] === "x" || body[1] === "X"
				? parseInt(body.slice(2), 16)
				: parseInt(body.slice(1), 10);
			// Reject non-scalar values rather than letting fromCodePoint throw.
			if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
				try {
					return String.fromCodePoint(code);
				} catch {
					return whole;
				}
			}
		}
		return whole;
	});
}

/** The markdown delimiters, longest first so `***` wins over `**` over `*`. */
const DELIMS: Array<{ mark: string; bold: boolean; italic: boolean }> = [
	{ mark: "***", bold: true, italic: true },
	{ mark: "___", bold: true, italic: true },
	{ mark: "**", bold: true, italic: false },
	{ mark: "__", bold: true, italic: false },
	{ mark: "*", bold: false, italic: true },
	{ mark: "_", bold: false, italic: true },
];

/** CommonMark's escapable set: ASCII punctuation, and nothing else. */
const ESCAPABLE_RE = /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/;

interface Style {
	bold: boolean;
	italic: boolean;
}

/** Tokenize one line. `stack` carries the emphasis state; a delimiter or tag
 *  with no partner is emitted as literal text instead of being dropped. */
function parseLine(line: string, markdown: boolean): LabelLine {
	const runs: LabelRun[] = [];
	const stack: Array<{ mark: string; style: Style }> = [];
	let buf = "";
	let style: Style = { bold: false, italic: false };

	const flush = (): void => {
		if (buf === "") return;
		const run: LabelRun = { text: decodeEntities(buf) };
		if (style.bold) run.bold = true;
		if (style.italic) run.italic = true;
		runs.push(run);
		buf = "";
	};

	let i = 0;
	while (i < line.length) {
		const rest = line.slice(i);

		if (markdown && rest[0] === "\\" && ESCAPABLE_RE.test(rest[1] ?? "")) {
			// A backslash escape makes the next character literal, so `\*` can
			// appear in a markdown label without opening emphasis. Only ASCII
			// punctuation escapes, per CommonMark — before anything else the
			// backslash is just a backslash, which is why `\n` stays on screen.
			buf += rest[1];
			i += 2;
			continue;
		}

		if (rest[0] === "<") {
			const tag = TAG_RE.exec(rest);
			if (tag) {
				const closing = tag[1] === "/";
				const bold = /^(b|strong)$/i.test(tag[2] as string);
				const open = stack[stack.length - 1];
				if (closing) {
					// Only pop a tag we actually opened; a stray </b> is literal.
					if (open && open.mark === (bold ? "<b>" : "<i>")) {
						flush();
						stack.pop();
						style = { ...open.style };
						i += tag[0].length;
						continue;
					}
				} else {
					flush();
					stack.push({ mark: bold ? "<b>" : "<i>", style: { ...style } });
					style = { bold: style.bold || bold, italic: style.italic || !bold };
					i += tag[0].length;
					continue;
				}
			}
		}

		if (markdown) {
			const d = DELIMS.find((c) => rest.startsWith(c.mark));
			if (d) {
				const open = stack[stack.length - 1];
				if (open && open.mark === d.mark) {
					flush();
					stack.pop();
					style = { ...open.style };
					i += d.mark.length;
					continue;
				}
				// Only open when the delimiter is actually closed later on this
				// line, and only when it isn't immediately followed by
				// whitespace — otherwise `2 * 3 * 4` would italicize " 3 " the
				// way no markdown renderer actually does.
				const next = line[i + d.mark.length];
				if (
					next !== undefined &&
					!/\s/.test(next) &&
					line.indexOf(d.mark, i + d.mark.length) !== -1
				) {
					flush();
					stack.push({ mark: d.mark, style: { ...style } });
					style = { bold: style.bold || d.bold, italic: style.italic || d.italic };
					i += d.mark.length;
					continue;
				}
			}
		}

		buf += rest[0];
		i += 1;
	}
	flush();
	return runs;
}

/** Where a line breaks. Mermaid spells it three ways — the `<br>` tag family, a
 *  real newline, and the two-character escape `\n` — but the escape only counts
 *  in a plain label: a markdown string goes through a markdown lexer, which has
 *  no `\n` escape and leaves the backslash on screen. */
const MD_BREAK_RE = /<br\s*\/?>|\r?\n/i;
const PLAIN_BREAK_RE = /<br\s*\/?>|\\n|\r?\n/i;

/**
 * Split `text` into lines of styled runs.
 *
 * `markdown` enables markdown emphasis and is set from the backtick-wrapped
 * Mermaid markdown-string form. HTML tags and entities are honoured in both
 * modes, matching Mermaid's `htmlLabels: true` default.
 */
export function parseLabelMarkup(text: string, markdown = false): LabelLine[] {
	// Each line is trimmed: Mermaid drops the whitespace around a break in both
	// of its label paths, and a stray leading space would shift a centred line.
	return text
		.split(markdown ? MD_BREAK_RE : PLAIN_BREAK_RE)
		.map((line) => parseLine(line.trim(), markdown));
}

/** Mermaid's `flowchart.wrappingWidth` default: markdown labels wrap here. */
export const DEFAULT_WRAP_WIDTH = 200;

export interface LabelLayout {
	/** Wrapped lines of styled runs. Never empty; a blank label is `[[]]`. */
	lines: LabelLine[];
	/** Widest laid-out line in px, each run measured in its own font. */
	width: number;
	/** `lines.length * fontSize`. */
	height: number;
}

export interface LabelLayoutOpts {
	markdown?: boolean;
	fontSize?: number;
	fontFamily?: string;
	/** Wrap markdown labels at this width. Ignored when `markdown` is unset —
	 *  a plain Mermaid string breaks only where the author asked it to. */
	wrapWidth?: number;
}

/** The CSS font shorthand for a run, in the order `measureText` expects. */
function runFont(run: LabelRun, fontSize: number, fontFamily: string): string {
	return `${run.italic ? "italic " : ""}${run.bold ? "bold " : ""}${fontSize}px ${fontFamily}`;
}

function lineWidth(line: LabelLine, fontSize: number, fontFamily: string): number {
	let w = 0;
	for (const run of line) {
		w += measureTextWidth(run.text, runFont(run, fontSize, fontFamily));
	}
	return w;
}

/**
 * Greedy word wrap. Words keep the styling of the run they came from, so a
 * `**long bold phrase**` stays bold across the break. A single word wider than
 * `max` is left to overflow rather than hard-broken, which is what Mermaid does.
 */
function wrapLine(line: LabelLine, max: number, fontSize: number, fontFamily: string): LabelLine[] {
	if (line.length === 0) { return [line]; }
	// Explode into words, each remembering its run's styling. Splitting on the
	// space *before* a word keeps the separator out of the wrapped output.
	const words: LabelRun[] = [];
	for (const run of line) {
		const parts = run.text.split(/(\s+)/).filter((p) => p !== "");
		for (const p of parts) {
			words.push({ ...run, text: p });
		}
	}
	const out: LabelLine[] = [];
	let current: LabelRun[] = [];
	let currentW = 0;
	for (const word of words) {
		const w = measureTextWidth(word.text, runFont(word, fontSize, fontFamily));
		const isSpace = /^\s+$/.test(word.text);
		// A run of whitespace never starts a line: it is dropped at the break.
		if (currentW > 0 && currentW + w > max && !isSpace) {
			out.push(mergeRuns(current));
			current = [];
			currentW = 0;
		}
		if (currentW === 0 && isSpace) { continue; }
		current.push(word);
		currentW += w;
	}
	out.push(mergeRuns(current));
	return out;
}

/** Re-join adjacent words that share styling, so the renderer emits one tspan
 *  per style change rather than one per word. */
function mergeRuns(words: LabelRun[]): LabelLine {
	const out: LabelRun[] = [];
	for (const word of words) {
		const last = out[out.length - 1];
		if (last && !!last.bold === !!word.bold && !!last.italic === !!word.italic) {
			last.text += word.text;
		} else {
			out.push({ ...word });
		}
	}
	// Trailing whitespace at a wrap point would push the visual centre off.
	const last = out[out.length - 1];
	if (last) {
		last.text = last.text.replace(/\s+$/, "");
		if (last.text === "" && out.length > 1) { out.pop(); }
	}
	return out;
}

/**
 * Parse, wrap and measure a label in one call.
 *
 * Both `estimateNodeSize` and the renderer go through here, so the box a node
 * reserves and the glyphs painted inside it always come from the same layout.
 */
export function layoutLabel(text: string, opts: LabelLayoutOpts = {}): LabelLayout {
	const fontSize = opts.fontSize ?? BASE_FONT_SIZE;
	const fontFamily = opts.fontFamily ?? BASE_FONT_FAMILY;
	const parsed = parseLabelMarkup(text, opts.markdown);
	const max = opts.markdown ? (opts.wrapWidth ?? DEFAULT_WRAP_WIDTH) : Infinity;
	const lines = Number.isFinite(max)
		? parsed.flatMap((line) => wrapLine(line, max, fontSize, fontFamily))
		: parsed;
	const width = Math.max(0, ...lines.map((l) => lineWidth(l, fontSize, fontFamily)));
	return { lines, width, height: lines.length * fontSize };
}
