/**
 * Selected note text as input, and linking it to the notes created from it.
 *
 * Only `import type` from obsidian here, so this stays testable under Vitest.
 */
import type { Editor, EditorChange, EditorPosition } from 'obsidian';
import { normalizeTitles } from './titles';

/** One selected line, split into the parts that stay and the part that becomes a link. */
export interface SelectedLine {
	/** Leading whitespace, heading marks, bullet or number, task checkbox. */
	prefix: string;
	/** The text that gets replaced by a link. */
	body: string;
	/** The title to search for. */
	title: string;
	/** What the reader sees today, kept as the link's display text. */
	display: string;
}

const PREFIX = /^\s*(?:#{1,6}\s+)?(?:(?:[-*+]|\d+[.)])\s+)?(?:\[.\]\s+)?/;
const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const SINGLE_WIKILINK = /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/;

/**
 * "- [ ] [[Inception (2010)|Inception]]" ->
 * prefix "- [ ] ", body "[[Inception (2010)|Inception]]",
 * title "Inception (2010)", display "Inception".
 */
export function parseSelectedLine(line: string): SelectedLine {
	const prefix = PREFIX.exec(line)?.[0] ?? '';
	const body = line.slice(prefix.length).trimEnd();
	const title = body.replace(WIKILINK, '$1').trim();
	const single = SINGLE_WIKILINK.exec(body);
	const display = single ? (single[2] ?? single[1] ?? body) : body;
	return { prefix, body, title, display };
}

/** The title in a selected line, with list and link markup removed. */
export function cleanSelectedLine(line: string): string {
	return parseSelectedLine(line).title;
}

/** Titles from selected note text, one per line. */
export function titlesFromSelection(selection: string): string[] {
	return normalizeTitles(selection.split(/\r?\n/).map(cleanSelectedLine));
}

/** What a link made from a selected line displays. */
export type LinkTextStyle = 'title-year' | 'title' | 'typed' | 'note-name';

export const LINK_TEXT_STYLES: Record<LinkTextStyle, string> = {
	'title-year': 'Title and year, as the source shows them',
	title: 'Title, as the source shows it',
	typed: 'The text as you typed it',
	'note-name': 'Name of the new note',
};

/**
 * The display text for a link to a new note, or null for a plain link
 * (when the text would just repeat the note name).
 */
export function linkDisplayText(
	style: LinkTextStyle,
	note: { basename: string; title: string; year: string | null },
	typed: string,
): string | null {
	let text: string;
	switch (style) {
		case 'title-year':
			text = note.year ? `${note.title} (${note.year})` : note.title;
			break;
		case 'title':
			text = note.title;
			break;
		case 'typed':
			text = typed;
			break;
		case 'note-name':
			return null;
	}
	return text === note.basename ? null : text;
}

/** A selected line with its position in the editor. */
export interface SelectionSegment {
	line: number;
	fromCh: number;
	/** The selected text on that line, to check nothing changed before editing. */
	text: string;
	parsed: SelectedLine;
}

type SelectionEditor = Pick<Editor, 'getCursor' | 'getLine' | 'getRange'>;

/** Record each selected line that holds a title. Empty when nothing is selected. */
export function captureSelection(editor: SelectionEditor): SelectionSegment[] {
	const from = editor.getCursor('from');
	const to = editor.getCursor('to');
	if (from.line === to.line && from.ch === to.ch) return [];

	const segments: SelectionSegment[] = [];
	for (let line = from.line; line <= to.line; line++) {
		const fromCh = line === from.line ? from.ch : 0;
		const toCh = line === to.line ? to.ch : editor.getLine(line).length;
		const text = editor.getRange({ line, ch: fromCh }, { line, ch: toCh });
		const parsed = parseSelectedLine(text);
		if (parsed.title) segments.push({ line, fromCh, text, parsed });
	}
	return segments;
}

/**
 * Editor changes that turn each segment whose title produced a note into a
 * link to that note. A segment whose text changed since it was captured is
 * left alone.
 *
 * `makeLink(target, display)` returns the link text for a created note.
 */
export function linkChanges<T>(
	editor: Pick<Editor, 'getRange'>,
	segments: SelectionSegment[],
	createdByTitle: Map<string, T>,
	makeLink: (target: T, display: string) => string,
): EditorChange[] {
	const changes: EditorChange[] = [];
	for (const seg of segments) {
		const target = createdByTitle.get(seg.parsed.title);
		if (target === undefined) continue;
		const end: EditorPosition = { line: seg.line, ch: seg.fromCh + seg.text.length };
		if (editor.getRange({ line: seg.line, ch: seg.fromCh }, end) !== seg.text) continue;

		const bodyStart = seg.fromCh + seg.parsed.prefix.length;
		changes.push({
			from: { line: seg.line, ch: bodyStart },
			to: { line: seg.line, ch: bodyStart + seg.parsed.body.length },
			text: makeLink(target, seg.parsed.display),
		});
	}
	return changes;
}
