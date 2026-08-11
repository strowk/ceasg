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

		if (markdown && rest[0] === "\\" && rest.length > 1) {
			// A backslash escape makes the next character literal, so `\*` can
			// appear in a markdown label without opening emphasis.
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

/**
 * Split `text` into lines of styled runs.
 *
 * `markdown` enables markdown emphasis and is set from the backtick-wrapped
 * Mermaid markdown-string form. HTML tags and entities are honoured in both
 * modes, matching Mermaid's `htmlLabels: true` default.
 */
export function parseLabelMarkup(text: string, markdown = false): LabelLine[] {
	// The model stores newlines, but a hand-written label may still carry the
	// <br/> the author typed; normalize before splitting so both behave alike.
	const normalized = text.replace(/<br\s*\/?>/gi, "\n");
	return normalized.split("\n").map((line) => parseLine(line, markdown));
}
