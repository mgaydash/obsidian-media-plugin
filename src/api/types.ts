import type { MediaType } from '../core/notes';

/** Fetch a URL and parse the JSON body. Throws on a non-2xx response. */
export type HttpGetJson = (url: string) => Promise<unknown>;

/**
 * One search hit, normalized so the disambiguation logic does not need to
 * know which API it came from.
 */
export interface SearchResult {
	id: string;
	title: string;
	/** Four-digit year, or null when the API has no date. */
	year: string | null;
	overview: string;
	/** Small image for the pick list, if the API has one. */
	thumbnailUrl: string | null;
}

/** What every API client provides. Ported from the CLI's `MediaAPIClient`. */
export interface MediaClient<Details = unknown> {
	readonly mediaType: MediaType;
	search(title: string): Promise<SearchResult[]>;
	getDetails(id: string): Promise<Details>;
	/** The title and year as the API shows them, before filename cleanup. */
	getTitleAndYear(details: Details): { title: string; year: string | null };
	/** "Title (Year).md". Throws when the year is unknown. */
	getFilename(details: Details): string;
	/** Full note text. `poster` is the poster file name, when there is one. */
	formatNote(details: Details, poster?: string): string;
	getPosterUrl(details: Details): string | null;
}
