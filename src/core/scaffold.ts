/**
 * Collection pages and their Bases files.
 *
 * Each collection gets a base (`Movies Base.base`) that lists the notes whose
 * `collection` property links to it, and a page (`Movies.md`) that embeds the
 * base's first view. Membership uses `collection == link("Movies")`: a typed,
 * exact match. `file.hasLink()` would also match notes that merely mention the
 * page in their body, and `contains()` would match `[[Movies Archive]]`.
 */

import { COLLECTION_BY_MEDIA_TYPE, MediaType } from './notes';

export interface CollectionScaffold {
	collection: string;
	/** Page file name, such as `Movies.md`. */
	pageName: string;
	pageContent: string;
	/** Base file name, such as `Movies Base.base`. */
	baseName: string;
	baseContent: string;
}

/**
 * Card image height relative to its width, per collection. Film, TV and book
 * covers are about 2:3, IGDB `cover_big` is 227x320, album covers are square.
 */
const COVER_ASPECT: Record<Exclude<MediaType, 'lookup'>, number> = {
	movie: 1.5,
	tv: 1.5,
	game: 1.4,
	book: 1.5,
	album: 1,
};

/** Every collection, in command-menu order. */
export const SCAFFOLD_MEDIA_TYPES: MediaType[] = ['movie', 'tv', 'game', 'album', 'book', 'lookup'];

function membershipFilter(collection: string): string {
	return ['filters:', '  and:', `    - collection == link("${collection}")`].join('\n');
}

function coverBase(collection: string, aspect: number): string {
	return [
		membershipFilter(collection),
		'views:',
		'  - type: cards',
		'    name: Covers',
		'    order:',
		'      - file.name',
		'    sort:',
		'      - property: file.ctime',
		'        direction: DESC',
		'    image: note.poster',
		`    imageAspectRatio: ${aspect}`,
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
	].join('\n');
}

/**
 * A glossary: grouped A-Z by first letter. `.title()` upper-cases the letter
 * (Bases has no `toUpperCase()`), so `Dark` and `diaphanous` share a group.
 */
function lookupBase(collection: string): string {
	return [
		membershipFilter(collection),
		'formulas:',
		'  firstLetter: file.name.slice(0,1).title()',
		'properties:',
		'  formula.firstLetter:',
		'    displayName: First letter',
		'views:',
		'  - type: table',
		'    name: All',
		'    groupBy:',
		'      property: formula.firstLetter',
		'      direction: ASC',
		'    order:',
		'      - file.name',
		'      - tags',
		'    sort:',
		'      - property: file.name',
		'        direction: ASC',
		'  - type: table',
		'    name: Recently updated',
		'    order:',
		'      - file.name',
		'      - tags',
		'    sort:',
		'      - property: file.mtime',
		'        direction: DESC',
		'',
	].join('\n');
}

export function collectionScaffold(mediaType: MediaType): CollectionScaffold {
	const collection = COLLECTION_BY_MEDIA_TYPE[mediaType];
	const baseName = `${collection} Base.base`;
	const firstView = mediaType === 'lookup' ? 'All' : 'Covers';
	return {
		collection,
		pageName: `${collection}.md`,
		pageContent: `![[${baseName}#${firstView}]]\n`,
		baseName,
		baseContent:
			mediaType === 'lookup'
				? lookupBase(collection)
				: coverBase(collection, COVER_ASPECT[mediaType]),
	};
}

export interface ScaffoldFile {
	name: string;
	content: string;
}

export interface ScaffoldPlan {
	create: ScaffoldFile[];
	/** Names that already exist somewhere in the vault, left untouched. */
	skip: string[];
}

/**
 * Which files to create. `exists(name)` says whether a file a link to `name`
 * would reach already exists anywhere in the vault. Links resolve by name, so
 * a `Movies.md` in another folder is already the `[[Movies]]` page.
 */
export function planScaffold(
	mediaTypes: MediaType[],
	exists: (name: string) => boolean,
): ScaffoldPlan {
	const plan: ScaffoldPlan = { create: [], skip: [] };
	for (const mediaType of mediaTypes) {
		const s = collectionScaffold(mediaType);
		for (const file of [
			{ name: s.baseName, content: s.baseContent },
			{ name: s.pageName, content: s.pageContent },
		]) {
			if (exists(file.name)) plan.skip.push(file.name);
			else plan.create.push(file);
		}
	}
	return plan;
}
