/**
 * Choosing a search result, ported from the CLI's `filter_results_by_year()`,
 * `find_exact_title_match()` and the selection steps in `process_title()`.
 */
import type { SearchResult } from '../api/types';

export function filterResultsByYear(
	results: SearchResult[],
	year: string,
): SearchResult[] {
	return results.filter((r) => r.year === year);
}

/** The single result whose title matches exactly (ignoring case), or null. */
export function findExactTitleMatch(
	results: SearchResult[],
	title: string,
): SearchResult | null {
	const wanted = title.toLowerCase().trim();
	const matches = results.filter(
		(r) => r.title.toLowerCase().trim() === wanted,
	);
	return matches.length === 1 ? (matches[0] ?? null) : null;
}

export type Selection =
	| { kind: 'auto'; result: SearchResult; reason: 'exact' | 'only' }
	| { kind: 'ask'; results: SearchResult[] }
	| { kind: 'none' };

/**
 * Decide how to pick a result:
 * 1. Narrow by year when one was given (fall back to all results if none match).
 * 2. A single exact title match is picked automatically.
 * 3. Several results -> ask the user. One result -> pick it.
 */
export function selectResult(
	results: SearchResult[],
	title: string,
	year: string | null,
): Selection {
	if (results.length === 0) return { kind: 'none' };
	let candidates = results;
	if (year) {
		const filtered = filterResultsByYear(results, year);
		if (filtered.length > 0) candidates = filtered;
	}
	const exact = findExactTitleMatch(candidates, title);
	if (exact) return { kind: 'auto', result: exact, reason: 'exact' };
	if (candidates.length > 1) return { kind: 'ask', results: candidates };
	const only = candidates[0];
	return only ? { kind: 'auto', result: only, reason: 'only' } : { kind: 'none' };
}
