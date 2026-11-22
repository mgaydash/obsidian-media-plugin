import { describe, expect, it } from 'vitest';
import type { EditorPosition } from 'obsidian';
import { captureSelection, linkChanges, parseSelectedLine } from '../src/core/selection';

/** Minimal stand-in for Obsidian's Editor over an array of lines. */
function fakeEditor(lines: string[], from: EditorPosition, to: EditorPosition) {
	return {
		lines,
		getCursor: (side?: string) => (side === 'to' ? to : from),
		getLine: (n: number) => lines[n] ?? '',
		getRange: (a: EditorPosition, b: EditorPosition) => {
			if (a.line !== b.line) throw new Error('single-line ranges only');
			return (lines[a.line] ?? '').slice(a.ch, b.ch);
		},
	};
}

const wikilink = (file: string, display: string) =>
	display === file ? `[[${file}]]` : `[[${file}|${display}]]`;

describe('parseSelectedLine', () => {
	it.each([
		['Inception', '', 'Inception', 'Inception', 'Inception'],
		['  - [ ] Heat (1995)  ', '  - [ ] ', 'Heat (1995)', 'Heat (1995)', 'Heat (1995)'],
		['## Arrival', '## ', 'Arrival', 'Arrival', 'Arrival'],
		['2. [[Dune (2021)|Dune]]', '2. ', '[[Dune (2021)|Dune]]', 'Dune (2021)', 'Dune'],
		['- [[Alien]]', '- ', '[[Alien]]', 'Alien', 'Alien'],
	])('parses %j', (line, prefix, body, title, display) => {
		expect(parseSelectedLine(line)).toEqual({ prefix, body, title, display });
	});
});

describe('captureSelection', () => {
	it('returns nothing without a selection', () => {
		const ed = fakeEditor(['Inception'], { line: 0, ch: 2 }, { line: 0, ch: 2 });
		expect(captureSelection(ed)).toEqual([]);
	});

	it('captures whole and partial lines, skipping blanks', () => {
		const lines = ['Watch: - Heat', '', '- [ ] Alien', '- Dune and more'];
		const ed = fakeEditor(lines, { line: 0, ch: 7 }, { line: 3, ch: 6 });
		const segs = captureSelection(ed);
		expect(segs.map((s) => [s.line, s.fromCh, s.text, s.parsed.title])).toEqual([
			[0, 7, '- Heat', 'Heat'],
			[2, 0, '- [ ] Alien', 'Alien'],
			[3, 0, '- Dune', 'Dune'],
		]);
	});
});

describe('linkChanges', () => {
	it('links only the lines whose note was created, keeping bullets and display text', () => {
		const lines = ['- Inception', '- [ ] Nope', '3. [[Heat|Heat (Michael Mann)]]', '- Inception'];
		const ed = fakeEditor(lines, { line: 0, ch: 0 }, { line: 3, ch: 11 });
		const segs = captureSelection(ed);
		const created = new Map([
			['Inception', 'Inception (2010)'],
			['Heat', 'Heat (1995)'],
		]);

		const changes = linkChanges(ed, segs, created, wikilink);

		expect(changes).toEqual([
			{ from: { line: 0, ch: 2 }, to: { line: 0, ch: 11 }, text: '[[Inception (2010)|Inception]]' },
			{
				from: { line: 2, ch: 3 },
				to: { line: 2, ch: 31 },
				text: '[[Heat (1995)|Heat (Michael Mann)]]',
			},
			{ from: { line: 3, ch: 2 }, to: { line: 3, ch: 11 }, text: '[[Inception (2010)|Inception]]' },
		]);
	});

	it('omits the alias when the text already matches the note name', () => {
		const ed = fakeEditor(['Inception (2010)'], { line: 0, ch: 0 }, { line: 0, ch: 16 });
		const segs = captureSelection(ed);
		const changes = linkChanges(ed, segs, new Map([['Inception (2010)', 'Inception (2010)']]), wikilink);
		expect(changes[0]?.text).toBe('[[Inception (2010)]]');
	});

	it('keeps trailing spaces outside the link', () => {
		const ed = fakeEditor(['- Heat   '], { line: 0, ch: 0 }, { line: 0, ch: 9 });
		const segs = captureSelection(ed);
		const changes = linkChanges(ed, segs, new Map([['Heat', 'Heat (1995)']]), wikilink);
		expect(changes[0]).toMatchObject({ from: { ch: 2 }, to: { ch: 6 } });
	});

	it('leaves a line alone if it changed after it was captured', () => {
		const ed = fakeEditor(['- Heat'], { line: 0, ch: 0 }, { line: 0, ch: 6 });
		const segs = captureSelection(ed);
		ed.lines[0] = '- Hea';
		expect(linkChanges(ed, segs, new Map([['Heat', 'Heat (1995)']]), wikilink)).toEqual([]);
	});
});
