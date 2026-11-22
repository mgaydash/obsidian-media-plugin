/**
 * Genre -> tag mapping, ported from the CLI's `genre_mappings.yaml` and
 * `translate_genre_tag()`. Keys are vault tags; values are API genre strings
 * (compared case-insensitively).
 */
export const GENRE_MAPPINGS: Record<string, string[]> = {
	rpg: ['role-playing (rpg)', 'role playing', 'rpg'],
	'sci-fi': [
		'science fiction',
		'sci-fi',
		'scifi',
		'sifi',
		'si-fi',
		'sci-fi & fantasy',
	],
	'action-adventure': ['action/adventure', 'action & adventure'],
	'point-and-click': ['point-and-click'],
	'hack-and-slash': ["hack and slash/beat 'em up", 'hack and slash'],
	'beat-em-up': ["beat 'em up"],
	strategy: [
		'real time strategy (rts)',
		'turn-based strategy (tbs)',
		'strategy',
		'rts',
		'tbs',
	],
	shooter: [
		'first-person shooter',
		'third-person shooter',
		'shooter',
		'fps',
	],
	moba: ['moba'],
	fighting: ['fighting'],
	racing: ['racing'],
	sports: ['sport', 'sports'],
	puzzle: ['puzzle'],
	platformer: ['platform', 'platformer'],
	simulator: ['simulator', 'simulation'],
	indie: ['indie', 'independent'],
	adventure: ['adventure'],
	action: ['action'],
	arcade: ['arcade'],
	music: ['music'],
	'visual-novel': ['visual novel'],
	card: ['card & board game', 'card game'],
	zombie: ['zombie', 'zombies'],
	rock: ['rock', 'classic rock', 'hard rock'],
	alternative: ['alternative', 'alternative rock', 'indie rock'],
	pop: ['pop', 'pop rock'],
	electronic: ['electronic', 'electronica', 'edm'],
	'hip-hop': ['hip hop', 'hip-hop', 'rap'],
	jazz: ['jazz', 'jazz fusion'],
	metal: ['metal', 'heavy metal'],
	punk: ['punk', 'punk rock'],
	folk: ['folk', 'folk rock'],
	classical: ['classical'],
	country: ['country'],
	'progressive-rock': ['progressive rock', 'prog rock', 'prog-rock'],
};

/**
 * Translate an API genre into a vault tag. Unmapped genres are lowercased
 * and hyphenated: "Unknown Genre" -> "unknown-genre".
 */
export function translateGenreTag(genre: string): string {
	const lower = genre.toLowerCase().trim();
	for (const [tag, sources] of Object.entries(GENRE_MAPPINGS)) {
		if (sources.some((s) => s.toLowerCase() === lower)) return tag;
	}
	const sanitized = lower
		.replace(/[^\p{L}\p{N}_\s-]/gu, ' ')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
	return sanitized || 'unknown';
}
