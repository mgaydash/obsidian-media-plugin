import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../src/api/types';
import {
	filterResultsByYear,
	findExactTitleMatch,
	selectResult,
} from '../src/core/disambiguation';
import { translateGenreTag } from '../src/core/genres';
import { buildFrontmatter, sanitizeFilename } from '../src/core/notes';
import { cleanSelectedLine, titlesFromSelection } from '../src/core/selection';
import { extractTitleAndYear, normalizeTitles, splitTitles } from '../src/core/titles';

function result(id: string, title: string, year: string | null): SearchResult {
	return { id, title, year, overview: '', thumbnailUrl: null };
}

describe('titles', () => {
	it.each([
		['Inception (2010)', 'Inception', '2010'],
		['Inception', 'Inception', null],
		['  The Matrix   (1999)  ', 'The Matrix', '1999'],
		['Title (20XX)', 'Title (20XX)', null],
		['Blade Runner 2049', 'Blade Runner 2049', null],
	])('extracts %j', (input, title, year) => {
		expect(extractTitleAndYear(input)).toEqual({ title, year });
	});

	it('normalizes: trims, drops empties, de-duplicates in order', () => {
		expect(normalizeTitles([' A ', '', 'B', 'A', '   '])).toEqual(['A', 'B']);
	});

	it('splits pasted text on any line ending', () => {
		expect(splitTitles('Inception\r\nThe Matrix\n\nInception')).toEqual([
			'Inception',
			'The Matrix',
		]);
	});
});

describe('selected text', () => {
	it.each([
		['Inception', 'Inception'],
		['  - The Matrix (1999)  ', 'The Matrix (1999)'],
		['* Dune', 'Dune'],
		['+ Dune', 'Dune'],
		['3. Alien', 'Alien'],
		['1) Alien', 'Alien'],
		['- [ ] Heat (1995)', 'Heat (1995)'],
		['- [x] Heat', 'Heat'],
		['## Arrival', 'Arrival'],
		['[[Inception (2010)]]', 'Inception (2010)'],
		['- [[Inception (2010)|Inception]]', 'Inception (2010)'],
		['-5 Degrees', '-5 Degrees'],
		['1984', '1984'],
	])('cleans %j', (line, title) => {
		expect(cleanSelectedLine(line)).toBe(title);
	});

	it('splits a multi-line selection into titles', () => {
		expect(
			titlesFromSelection('- Inception\n\n- [[The Matrix (1999)]]\r\n- Inception\n'),
		).toEqual(['Inception', 'The Matrix (1999)']);
	});

	it('returns nothing for an empty selection', () => {
		expect(titlesFromSelection('')).toEqual([]);
	});
});

describe('notes', () => {
	it('builds frontmatter with tags', () => {
		expect(buildFrontmatter('Movies', ['action', 'sci-fi'])).toBe(
			'---\ncollection: "[[Movies]]"\ntags:\n  - action\n  - sci-fi\n---',
		);
	});

	it('omits tags when there are none', () => {
		expect(buildFrontmatter('Series', [])).toBe(
			'---\ncollection: "[[Series]]"\n---',
		);
	});

	it('adds the poster property', () => {
		expect(buildFrontmatter('Movies', [], 'X (2020).jpg')).toBe(
			'---\ncollection: "[[Movies]]"\nposter: "[[X (2020).jpg]]"\n---',
		);
	});

	it.each([
		['Star Wars: A New Hope', 'Star Wars - A New Hope'],
		['AC/DC\\Live', 'AC-DC-Live'],
		['What If?', 'What If'],
	])('sanitizes %j', (input, expected) => {
		expect(sanitizeFilename(input)).toBe(expected);
	});
});

describe('genres', () => {
	it.each([
		['Science Fiction', 'sci-fi'],
		['Action & Adventure', 'action-adventure'],
		['Role-Playing (RPG)', 'rpg'],
		['Thriller', 'thriller'],
		['Unknown Genre', 'unknown-genre'],
		['Sci-Fi & Fantasy', 'sci-fi'],
		['War & Politics', 'war-politics'],
		['Música Latina', 'música-latina'],
		['!!!', 'unknown'],
	])('translates %j', (genre, tag) => {
		expect(translateGenreTag(genre)).toBe(tag);
	});
});

describe('disambiguation', () => {
	const results = [
		result('1', 'Loot', '2022'),
		result('2', 'Loot - Blood Treasure', '2022'),
		result('3', 'Loot', '1970'),
	];

	it('filters by year', () => {
		expect(filterResultsByYear(results, '1970').map((r) => r.id)).toEqual(['3']);
	});

	it('finds a single exact match, ignoring case', () => {
		expect(findExactTitleMatch(results.slice(0, 2), 'loot')?.id).toBe('1');
	});

	it('returns null when several results match exactly', () => {
		expect(findExactTitleMatch(results, 'Loot')).toBeNull();
	});

	it('auto-selects the exact match within the year', () => {
		expect(selectResult(results, 'Loot', '2022')).toEqual({
			kind: 'auto',
			result: results[0],
			reason: 'exact',
		});
	});

	it('asks when the exact title is ambiguous without a year', () => {
		const selection = selectResult(results, 'Loot', null);
		expect(selection.kind).toBe('ask');
	});

	it('falls back to all results when no year matches', () => {
		const selection = selectResult(results, 'Loot', '1999');
		expect(selection).toEqual({ kind: 'ask', results });
	});

	it('auto-selects a lone result', () => {
		const only = [result('9', 'Something Else', '2001')];
		expect(selectResult(only, 'Something', null)).toEqual({
			kind: 'auto',
			result: only[0],
			reason: 'only',
		});
	});

	it('reports no results', () => {
		expect(selectResult([], 'X', null)).toEqual({ kind: 'none' });
	});
});
