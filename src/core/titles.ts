/**
 * Title input helpers, ported from the CLI's `normalize_titles()` and
 * `extract_title_and_year()`.
 */

/** Split pasted text into titles, one per line. */
export function splitTitles(text: string): string[] {
	return normalizeTitles(text.split(/\r?\n/));
}

/**
 * Turn a line of selected note text into a title: drop list bullets,
 * numbering, task checkboxes, headings and wikilink brackets.
 *
 * "- [ ] [[Inception (2010)|Inception]]" -> "Inception (2010)"
 */
export function cleanSelectedLine(line: string): string {
	return line
		.trim()
		.replace(/^#{1,6}\s+/, '')
		.replace(/^(?:[-*+]|\d+[.)])\s+/, '')
		.replace(/^\[.\]\s+/, '')
		.replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, '$1')
		.trim();
}

/** Titles from selected note text, one per line. */
export function titlesFromSelection(selection: string): string[] {
	return normalizeTitles(selection.split(/\r?\n/).map(cleanSelectedLine));
}

/** Strip whitespace, drop empty entries and de-duplicate, keeping order. */
export function normalizeTitles(titles: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of titles) {
		const title = raw.trim();
		if (title && !seen.has(title)) {
			seen.add(title);
			result.push(title);
		}
	}
	return result;
}

/**
 * Extract a trailing four-digit year in parentheses.
 *
 * "Inception (2010)" -> { title: "Inception", year: "2010" }
 * "Inception"        -> { title: "Inception", year: null }
 */
export function extractTitleAndYear(input: string): {
	title: string;
	year: string | null;
} {
	const match = /^(.+?)\s*\((\d{4})\)\s*$/.exec(input);
	if (match && match[1] !== undefined && match[2] !== undefined) {
		return { title: match[1].trim(), year: match[2] };
	}
	return { title: input.trim(), year: null };
}
