/**
 * MusicBrainz client for albums, ported from the CLI's
 * `lib/api/musicbrainz_client.py`. Covers come from the Cover Art Archive.
 *
 * MusicBrainz needs no key, but it asks every client to send a descriptive
 * User-Agent and to make at most one request per second.
 */
import { translateGenreTag } from '../core/genres';
import {
	buildFrontmatter,
	COLLECTION_BY_MEDIA_TYPE,
	posterEmbed,
	sanitizeFilename,
	wikilink,
} from '../core/notes';
import type { HttpRequestJson, MediaClient, SearchResult, Sleep } from './types';

const BASE_URL = 'https://musicbrainz.org/ws/2';
const COVER_URL = 'https://coverartarchive.org/release';
const MIN_INTERVAL_MS = 1000;

interface MbArtistCredit {
	name?: string;
	artist?: { name?: string };
}

interface MbReleaseGroup {
	'primary-type'?: string | null;
	'secondary-types'?: string[];
	tags?: MbTag[];
}

interface MbTag {
	name: string;
	count?: number;
}

interface MbRelease {
	id: string;
	title?: string;
	date?: string;
	disambiguation?: string;
	'artist-credit'?: MbArtistCredit[];
	'release-group'?: MbReleaseGroup;
	'label-info'?: { label?: { name?: string } | null }[];
	tags?: MbTag[];
}

/** Album details in the same shape the CLI's client returns. */
export interface AlbumDetails {
	id: string;
	title: string;
	artist: string;
	date: string;
	label: string;
	primaryType: string;
	secondaryTypes: string[];
	tags: string[];
	disambiguation: string;
}

/** Artist names joined with " & ", as the CLI does. */
function artistName(credits: MbArtistCredit[] | undefined): string {
	const names = (credits ?? [])
		.filter((c) => c.artist)
		.map((c) => c.artist?.name ?? 'Unknown');
	return names.length > 0 ? names.join(' & ') : 'Various Artists';
}

/** Escape Lucene query syntax so a title is searched as plain words. */
function luceneEscape(text: string): string {
	return text.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, '\\$1');
}

export class MusicBrainzClient implements MediaClient<AlbumDetails> {
	readonly mediaType = 'album' as const;
	private lastRequest = 0;

	constructor(
		private readonly request: HttpRequestJson,
		private readonly userAgent: string,
		private readonly sleep: Sleep,
		private readonly now: () => number = Date.now,
	) {}

	private async get(path: string, params: Record<string, string>): Promise<unknown> {
		const wait = this.lastRequest + MIN_INTERVAL_MS - this.now();
		if (wait > 0) await this.sleep(wait);
		this.lastRequest = this.now();
		const query = new URLSearchParams({ ...params, fmt: 'json' });
		return this.request({
			url: `${BASE_URL}${path}?${query.toString()}`,
			headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
		});
	}

	async search(title: string): Promise<SearchResult[]> {
		const data = (await this.get('/release', {
			query: `release:(${luceneEscape(title)}) AND status:official AND primarytype:album`,
			limit: '25',
		})) as { releases?: MbRelease[] };

		return (data.releases ?? []).map((r) => {
			const group = r['release-group'] ?? {};
			const type = [group['primary-type'] ?? 'Album', ...(group['secondary-types'] ?? [])].join('/');
			const details = [artistName(r['artist-credit']), type, r.disambiguation]
				.filter(Boolean)
				.join(' · ');
			return {
				id: r.id,
				title: r.title ?? 'Unknown',
				year: r.date ? r.date.slice(0, 4) : null,
				overview: details,
				thumbnailUrl: `${COVER_URL}/${r.id}/front-250`,
			};
		});
	}

	async getDetails(id: string): Promise<AlbumDetails> {
		const r = (await this.get(`/release/${encodeURIComponent(id)}`, {
			inc: 'artists+labels+release-groups+tags',
		})) as MbRelease;
		const group = r['release-group'] ?? {};

		// Release-group tags are better populated than release tags.
		const tagSource = group.tags && group.tags.length > 0 ? group.tags : (r.tags ?? []);
		const tags = [...tagSource]
			.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
			.filter((t) => (t.count ?? 0) > 5)
			.slice(0, 5)
			.map((t) => t.name);

		return {
			id: r.id,
			title: r.title ?? 'Unknown',
			artist: artistName(r['artist-credit']),
			date: r.date ?? '',
			label: r['label-info']?.[0]?.label?.name ?? 'Independent',
			primaryType: group['primary-type'] ?? 'Album',
			secondaryTypes: group['secondary-types'] ?? [],
			tags,
			disambiguation: r.disambiguation ?? '',
		};
	}

	getTitleAndYear(album: AlbumDetails): { title: string; year: string | null } {
		return { title: album.title, year: album.date ? album.date.slice(0, 4) : null };
	}

	/** "Artist - Album (Year).md", with "(TBD)" when there is no date. */
	getFilename(album: AlbumDetails): string {
		const year = album.date ? album.date.slice(0, 4) : 'TBD';
		return `${sanitizeFilename(album.artist)} - ${sanitizeFilename(album.title)} (${year}).md`;
	}

	formatNote(album: AlbumDetails, poster?: string): string {
		const url = album.id ? `https://musicbrainz.org/release/${album.id}` : 'Not available';

		const tags: string[] = [];
		const add = (tag: string) => {
			if (tag && !tags.includes(tag)) tags.push(tag);
		};
		// Secondary types (Live, Compilation, ...) become tags as-is.
		for (const type of album.secondaryTypes) add(type.toLowerCase().replace(/ /g, '-'));
		for (const tag of album.tags) add(translateGenreTag(tag));

		const description = `By ${wikilink(album.artist)}. Released by ${wikilink(album.label)}.`;
		const frontmatter = buildFrontmatter(COLLECTION_BY_MEDIA_TYPE.album, tags, poster);
		const embed = poster ? `\n\n${posterEmbed(poster)}` : '';
		return `${frontmatter}${embed}\n\n## Links\n${url}\n\n## Description\n${description}\n`;
	}

	/** The Cover Art Archive front cover. A release without one fails the download, which is reported. */
	getPosterUrl(album: AlbumDetails): string | null {
		return album.id ? `${COVER_URL}/${album.id}/front` : null;
	}
}
