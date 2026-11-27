/**
 * Google Books client, ported from the CLI's `lib/api/googlebooks_client.py`.
 *
 * Google returns one entry per edition, so search results are grouped by
 * (title, author). The first edition in a group stands for it, and the group
 * reports the earliest year, the closest Google Books gets to a first
 * publication date.
 */
import { translateGenreTag } from '../core/genres';
import {
	buildFrontmatter,
	COLLECTION_BY_MEDIA_TYPE,
	posterEmbed,
	sanitizeFilename,
	wikilink,
} from '../core/notes';
import { HttpError, HttpRequestJson, MediaClient, SearchResult, Sleep } from './types';

const BASE_URL = 'https://www.googleapis.com/books/v1';
const MAX_SUBJECTS = 5;
const COVER_SIZES = ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail'];
/** Google Books returns these now and then for valid requests; a retry clears them. */
const RETRY_STATUSES = [429, 500, 502, 503, 504];
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 500;

interface VolumeInfo {
	title?: string;
	authors?: string[];
	publishedDate?: string;
	description?: string;
	categories?: string[];
	imageLinks?: Record<string, string | undefined>;
	infoLink?: string;
}

interface Volume {
	id?: string;
	volumeInfo?: VolumeInfo;
}

export interface BookDetails {
	id: string;
	title: string;
	author: string;
	description: string;
	subjects: string[];
	firstPublishYear: number | null;
	coverUrl: string | null;
	infoLink: string;
}

/** First four-digit year in a date string. */
export function extractYear(text: string | undefined): number | null {
	const match = /\b(\d{4})\b/.exec(text ?? '');
	return match?.[1] ? Number(match[1]) : null;
}

function authorOf(info: VolumeInfo): string {
	const authors = info.authors ?? [];
	return authors.length > 0 ? authors.join(' & ') : 'Unknown';
}

/** Largest cover, over HTTPS, without the page-curl overlay. */
export function bestCoverUrl(links: Record<string, string | undefined> | undefined): string | null {
	if (!links) return null;
	for (const size of COVER_SIZES) {
		const url = links[size];
		if (url) return url.replace('http://', 'https://').replace('&edge=curl', '');
	}
	return null;
}

function smallestCoverUrl(links: Record<string, string | undefined> | undefined): string | null {
	const url = links?.smallThumbnail ?? links?.thumbnail;
	return url ? url.replace('http://', 'https://').replace('&edge=curl', '') : null;
}

export class GoogleBooksClient implements MediaClient<BookDetails> {
	readonly mediaType = 'book' as const;
	/** Google Books branding guidelines: shown alongside any search results. */
	readonly resultAttribution = 'Powered by Google';
	/** Stand-in volume id -> earliest year across its editions, filled by search(). */
	private readonly earliestYears = new Map<string, number | null>();

	constructor(
		private readonly apiKey: string,
		private readonly request: HttpRequestJson,
		private readonly sleep: Sleep,
	) {}

	/** GET with retries for the transient errors Google Books is known for. */
	private async get(path: string, params: Record<string, string> = {}): Promise<unknown> {
		const query = new URLSearchParams({ key: this.apiKey, country: 'US', ...params });
		const url = `${BASE_URL}${path}?${query.toString()}`;
		for (let attempt = 0; ; attempt++) {
			try {
				return await this.request({ url });
			} catch (err) {
				const status = err instanceof HttpError ? err.status : null;
				const transient = status === null || RETRY_STATUSES.includes(status);
				if (!transient || attempt >= MAX_RETRIES) {
					const detail = err instanceof Error ? err.message : String(err);
					throw new Error(`Google Books API error: ${detail}`);
				}
				await this.sleep(RETRY_BACKOFF_MS * 2 ** attempt);
			}
		}
	}

	async search(title: string): Promise<SearchResult[]> {
		const data = (await this.get('/volumes', {
			q: `intitle:${title}`,
			maxResults: '25',
			printType: 'books',
		})) as { items?: Volume[] | null };

		const groups = new Map<string, { volume: Volume; info: VolumeInfo; year: number | null }>();
		for (const volume of data.items ?? []) {
			const info = volume.volumeInfo ?? {};
			const key = `${(info.title ?? 'Unknown').toLowerCase()}\u0000${authorOf(info).toLowerCase()}`;
			const year = extractYear(info.publishedDate);
			const group = groups.get(key);
			if (!group) {
				groups.set(key, { volume, info, year });
			} else if (year !== null && (group.year === null || year < group.year)) {
				group.year = year;
			}
		}

		return [...groups.values()].map(({ volume, info, year }) => {
			const id = volume.id ?? '';
			this.earliestYears.set(id, year);
			return {
				id,
				title: info.title ?? 'Unknown',
				year: year === null ? null : String(year),
				overview: authorOf(info),
				thumbnailUrl: smallestCoverUrl(info.imageLinks),
			};
		});
	}

	async getDetails(id: string): Promise<BookDetails> {
		const data = (await this.get(`/volumes/${encodeURIComponent(id)}`)) as Volume;
		const info = data.volumeInfo ?? {};
		const remembered = this.earliestYears.get(id);
		return {
			id,
			title: info.title ?? 'Unknown',
			author: authorOf(info),
			// Descriptions may hold simple HTML; notes are plain Markdown.
			description: (info.description ?? '').replace(/<[^>]+>/g, '').trim(),
			subjects: (info.categories ?? []).slice(0, MAX_SUBJECTS),
			firstPublishYear: remembered ?? extractYear(info.publishedDate),
			coverUrl: bestCoverUrl(info.imageLinks),
			infoLink: info.infoLink ?? '',
		};
	}

	getTitleAndYear(book: BookDetails): { title: string; year: string | null } {
		return {
			title: book.title,
			year: book.firstPublishYear === null ? null : String(book.firstPublishYear),
		};
	}

	/** "Author - Title (Year).md": books by different authors often share a title. */
	getFilename(book: BookDetails): string {
		const year = book.firstPublishYear ?? 'TBD';
		return `${sanitizeFilename(book.author)} - ${sanitizeFilename(book.title)} (${year}).md`;
	}

	formatNote(book: BookDetails, poster?: string): string {
		const tags: string[] = [];
		for (const subject of book.subjects) {
			const tag = translateGenreTag(subject);
			if (tag && !tags.includes(tag)) tags.push(tag);
		}
		const by = `By ${wikilink(book.author)}.`;
		const description = book.description ? `${book.description}\n\n${by}` : by;

		const frontmatter = buildFrontmatter(COLLECTION_BY_MEDIA_TYPE.book, tags, poster);
		const embed = poster ? `\n\n${posterEmbed(poster)}` : '';
		return `${frontmatter}${embed}\n\n## Links\n${book.infoLink || 'Not available'}\n\n## Description\n${description}\n`;
	}

	getPosterUrl(book: BookDetails): string | null {
		return book.coverUrl;
	}
}
