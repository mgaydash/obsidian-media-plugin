import { describe, expect, it } from 'vitest';
import { collectionScaffold, planScaffold, SCAFFOLD_MEDIA_TYPES } from '../src/core/scaffold';

describe('collectionScaffold', () => {
	it('builds a cover base and a page for movies', () => {
		const s = collectionScaffold('movie');
		expect(s.pageName).toBe('Movies.md');
		expect(s.baseName).toBe('Movies Base.base');
		expect(s.pageContent).toBe('![[Movies Base.base#Covers]]\n');
		expect(s.baseContent).toBe(
			[
				'filters:',
				'  and:',
				'    - collection == link("Movies")',
				'views:',
				'  - type: cards',
				'    name: Covers',
				'    order:',
				'      - file.name',
				'    sort:',
				'      - property: file.ctime',
				'        direction: DESC',
				'    image: note.poster',
				'    imageAspectRatio: 1.5',
				'    cardSize: 150',
				'  - type: table',
				'    name: Table',
				'    order:',
				'      - file.name',
				'      - tags',
				'      - file.ctime',
				'    sort:',
				'      - property: file.name',
				'        direction: ASC',
				'',
			].join('\n'),
		);
	});

	it('uses square cards for albums and the Series collection for TV', () => {
		expect(collectionScaffold('album').baseContent).toContain('imageAspectRatio: 1\n');
		expect(collectionScaffold('tv').baseContent).toContain('collection == link("Series")');
		expect(collectionScaffold('tv').pageName).toBe('Series.md');
	});

	it('builds an A-Z glossary for lookups, with no cover view', () => {
		const s = collectionScaffold('lookup');
		expect(s.pageContent).toBe('![[Lookups Base.base#All]]\n');
		expect(s.baseContent).toContain('collection == link("Lookups")');
		expect(s.baseContent).toContain('firstLetter: file.name.slice(0,1).title()');
		expect(s.baseContent).toContain('property: formula.firstLetter');
		expect(s.baseContent).not.toContain('note.poster');
	});

	it('names each page after the view it embeds', () => {
		for (const t of SCAFFOLD_MEDIA_TYPES) {
			const s = collectionScaffold(t);
			const view = /#(.+)]]/.exec(s.pageContent)?.[1];
			expect(s.baseContent).toContain(`    name: ${view}\n`);
		}
	});
});

describe('planScaffold', () => {
	it('creates everything in an empty vault', () => {
		const plan = planScaffold(SCAFFOLD_MEDIA_TYPES, () => false);
		expect(plan.skip).toEqual([]);
		expect(plan.create.map((f) => f.name)).toHaveLength(12);
	});

	it('skips files that exist and keeps the rest', () => {
		const existing = new Set(['Movies.md', 'Lookups Base.base']);
		const plan = planScaffold(['movie', 'lookup'], (n) => existing.has(n));
		expect(plan.create.map((f) => f.name)).toEqual(['Movies Base.base', 'Lookups.md']);
		expect(plan.skip).toEqual(['Movies.md', 'Lookups Base.base']);
	});
});
