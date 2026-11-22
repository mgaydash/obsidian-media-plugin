/**
 * TMDB client for movies and TV, ported from the CLI's `lib/api/tmdb_client.py`.
 * Note text matches what the CLI writes.
 */
import { translateGenreTag } from '../core/genres';
import {
	buildFrontmatter,
	COLLECTION_BY_MEDIA_TYPE,
	MediaType,
	posterEmbed,
	sanitizeFilename,
	wikilink,
} from '../core/notes';
import type { HttpGetJson, MediaClient, SearchResult } from './types';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_URL = 'https://image.tmdb.org/t/p';

interface TmdbSearchItem {
	id: number;
	title?: string;
	name?: string;
	release_date?: string;
	first_air_date?: string;
	overview?: string;
	poster_path?: string | null;
}

interface TmdbPerson {
	name?: string;
	character?: string;
	job?: string;
}

export interface TmdbDetails {
	id: number;
	title?: string;
	name?: string;
	release_date?: string;
	first_air_date?: string;
	overview?: string;
	poster_path?: string | null;
	genres?: { name?: string }[];
	created_by?: { name: string }[];
	credits?: { cast?: TmdbPerson[]; crew?: TmdbPerson[] };
	external_ids?: { imdb_id?: string | null };
}

export class TmdbClient implements MediaClient<TmdbDetails> {
	constructor(
		private readonly apiKey: string,
		readonly mediaType: MediaType,
		private readonly getJson: HttpGetJson,
	) {}

	private url(path: string, params: Record<string, string>): string {
		const query = new URLSearchParams({
			api_key: this.apiKey,
			language: 'en-US',
			...params,
		});
		return `${BASE_URL}${path}?${query.toString()}`;
	}

	async search(title: string): Promise<SearchResult[]> {
		const data = (await this.getJson(
			this.url(`/search/${this.mediaType}`, { query: title }),
		)) as { results?: TmdbSearchItem[] };
		return (data.results ?? []).map((item) => this.toResult(item));
	}

	private toResult(item: TmdbSearchItem): SearchResult {
		const date =
			this.mediaType === 'movie' ? item.release_date : item.first_air_date;
		return {
			id: String(item.id),
			title: item.title ?? item.name ?? 'Unknown',
			year: date ? date.slice(0, 4) : null,
			overview: item.overview ?? '',
			thumbnailUrl: item.poster_path
				? `${IMAGE_URL}/w92${item.poster_path}`
				: null,
		};
	}

	async getDetails(id: string): Promise<TmdbDetails> {
		return (await this.getJson(
			this.url(`/${this.mediaType}/${id}`, {
				append_to_response: 'credits,external_ids',
			}),
		)) as TmdbDetails;
	}

	getFilename(details: TmdbDetails): string {
		const isMovie = this.mediaType === 'movie';
		const year = ((isMovie ? details.release_date : details.first_air_date) ?? '').slice(0, 4);
		const title = (isMovie ? details.title : details.name) ?? 'Unknown';
		if (!year) throw new Error('Could not determine release year');
		return `${sanitizeFilename(title)} (${year}).md`;
	}

	formatNote(details: TmdbDetails, poster?: string): string {
		const imdbId = details.external_ids?.imdb_id;
		const imdbLink = imdbId
			? `https://www.imdb.com/title/${imdbId}`
			: 'Not available';
		const overview = details.overview ?? 'No description available.';

		const cast = (details.credits?.cast ?? [])
			.slice(0, 3)
			.map(
				(c) =>
					`${c.character ?? 'Unknown'} (${wikilink(c.name ?? 'Unknown')})`,
			)
			.join(', ');

		let description: string;
		if (this.mediaType === 'movie') {
			const director = (details.credits?.crew ?? []).find(
				(c) => c.job === 'Director',
			);
			const directorText = director?.name
				? wikilink(director.name)
				: 'Unknown';
			description = `${overview} Directed by ${directorText}. Starring ${cast}.`;
		} else {
			const creator = details.created_by?.[0];
			const creatorText = creator ? wikilink(creator.name) : 'Unknown';
			description = `${overview} Created by ${creatorText}. Starring ${cast}.`;
		}

		const tags: string[] = [];
		for (const genre of details.genres ?? []) {
			if (!genre.name) continue;
			const tag = translateGenreTag(genre.name);
			if (!tags.includes(tag)) tags.push(tag);
		}

		const frontmatter = buildFrontmatter(
			COLLECTION_BY_MEDIA_TYPE[this.mediaType],
			tags,
			poster,
		);
		const embed = poster ? `\n\n${posterEmbed(poster)}` : '';
		return `${frontmatter}${embed}\n\n## Links\n${imdbLink}\n\n## Description\n${description}\n`;
	}

	getPosterUrl(details: TmdbDetails): string | null {
		return details.poster_path
			? `${IMAGE_URL}/original${details.poster_path}`
			: null;
	}
}
