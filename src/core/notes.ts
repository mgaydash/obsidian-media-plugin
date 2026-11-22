/**
 * Note-building helpers shared by every media client, ported from the CLI's
 * `lib/obsidian_utils.py`.
 */

export type MediaType = 'movie' | 'tv' | 'game' | 'album' | 'book';

/** Media type -> the collection note a new note belongs to. */
export const COLLECTION_BY_MEDIA_TYPE: Record<MediaType, string> = {
	movie: 'Movies',
	tv: 'Series',
	game: 'Games',
	album: 'Albums',
	book: 'Books',
};

export function wikilink(text: string): string {
	return `[[${text}]]`;
}

/** Replace characters that are awkward in file names. */
export function sanitizeFilename(title: string): string {
	return title
		.replace(/:/g, ' -')
		.replace(/[/\\]/g, '-')
		.replace(/\?/g, '');
}

/**
 * Build the `---` frontmatter block.
 *
 * `collection` is always present. `tags` is omitted when there are none.
 * `poster` is added when the note has a downloaded poster.
 */
export function buildFrontmatter(
	collection: string,
	tags: string[],
	poster?: string,
): string {
	const lines = ['---', `collection: "${wikilink(collection)}"`];
	if (tags.length > 0) {
		lines.push('tags:');
		for (const tag of tags) lines.push(`  - ${tag}`);
	}
	if (poster) {
		lines.push(`poster: "${wikilink(poster)}"`);
	}
	lines.push('---');
	return lines.join('\n');
}

/** Embed line placed between the frontmatter and the body. */
export function posterEmbed(poster: string): string {
	return `![[${poster}]]`;
}
