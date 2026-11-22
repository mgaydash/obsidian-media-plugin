/**
 * IGDB client for games, ported from the CLI's `lib/api/igdb_client.py`.
 * IGDB signs in through Twitch: a client ID and secret buy an access token.
 */
import { translateGenreTag } from '../core/genres';
import {
	buildFrontmatter,
	COLLECTION_BY_MEDIA_TYPE,
	posterEmbed,
	sanitizeFilename,
	wikilink,
} from '../core/notes';
import type { HttpRequestJson, MediaClient, SearchResult } from './types';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const GAMES_URL = 'https://api.igdb.com/v4/games';
const IMAGE_URL = 'https://images.igdb.com/igdb/image/upload';

interface IgdbCompany {
	company?: { name?: string };
	developer?: boolean;
	publisher?: boolean;
}

export interface IgdbGame {
	id: number;
	name?: string;
	/** Unix timestamp, in seconds. */
	first_release_date?: number;
	summary?: string;
	url?: string;
	cover?: { image_id?: string } | null;
	involved_companies?: IgdbCompany[];
	game_modes?: { name?: string }[];
	genres?: { name?: string }[];
}

/** Year of a Unix timestamp, in UTC so it never shifts with the local time zone. */
export function igdbYear(timestamp: number | undefined): string | null {
	if (timestamp === undefined) return null;
	return String(new Date(timestamp * 1000).getUTCFullYear());
}

/** Quote a title for an Apicalypse `search` clause. */
function apicalypseString(text: string): string {
	return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export class IgdbClient implements MediaClient<IgdbGame> {
	readonly mediaType = 'game' as const;
	private token: string | null = null;

	constructor(
		private readonly clientId: string,
		private readonly clientSecret: string,
		private readonly request: HttpRequestJson,
	) {}

	private async accessToken(): Promise<string> {
		if (this.token) return this.token;
		const query = new URLSearchParams({
			client_id: this.clientId,
			client_secret: this.clientSecret,
			grant_type: 'client_credentials',
		});
		const data = (await this.request({
			url: `${TOKEN_URL}?${query.toString()}`,
			method: 'POST',
		})) as { access_token?: string };
		if (!data.access_token) throw new Error('Twitch did not return an access token');
		this.token = data.access_token;
		return this.token;
	}

	private async games(body: string): Promise<IgdbGame[]> {
		const token = await this.accessToken();
		const data = await this.request({
			url: GAMES_URL,
			method: 'POST',
			headers: {
				'Client-ID': this.clientId,
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
			body,
		});
		return Array.isArray(data) ? (data as IgdbGame[]) : [];
	}

	async search(title: string): Promise<SearchResult[]> {
		// A limit of 25 keeps exact matches (such as "Fate") from being cut off.
		const games = await this.games(
			`search ${apicalypseString(title)}; fields name, first_release_date, summary, url, involved_companies, cover.image_id; limit 25;`,
		);
		return games.map((g) => ({
			id: String(g.id),
			title: g.name ?? 'Unknown',
			year: igdbYear(g.first_release_date),
			overview: g.summary ?? '',
			thumbnailUrl: g.cover?.image_id
				? `${IMAGE_URL}/t_thumb/${g.cover.image_id}.jpg`
				: null,
		}));
	}

	async getDetails(id: string): Promise<IgdbGame> {
		if (!/^\d+$/.test(id)) throw new Error(`Invalid IGDB id: ${id}`);
		const games = await this.games(
			`fields name, first_release_date, summary, url, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, game_modes.name, genres.name, cover.image_id; where id = ${id};`,
		);
		const game = games[0];
		if (!game) throw new Error(`Game with ID ${id} not found`);
		return game;
	}

	getTitleAndYear(game: IgdbGame): { title: string; year: string | null } {
		return { title: game.name ?? 'Unknown', year: igdbYear(game.first_release_date) };
	}

	/** Games without a release date get "(TBD)", as in the CLI. */
	getFilename(game: IgdbGame): string {
		const { title, year } = this.getTitleAndYear(game);
		return `${sanitizeFilename(title)} (${year ?? 'TBD'}).md`;
	}

	formatNote(game: IgdbGame, poster?: string): string {
		const url = game.url ?? 'Not available';
		const summary = game.summary ?? 'No description available.';

		const companies = game.involved_companies ?? [];
		const developer = companies.find((c) => c.developer);
		const publisher = companies.find((c) => c.publisher);
		const devText = developer ? wikilink(developer.company?.name ?? 'Unknown') : 'Unknown';
		const pubText = publisher ? wikilink(publisher.company?.name ?? 'Unknown') : 'Unknown';
		const description = `${summary} Developed by ${devText}. Published by ${pubText}.`;

		const tags: string[] = [];
		const add = (tag: string) => {
			if (tag && !tags.includes(tag)) tags.push(tag);
		};
		for (const mode of game.game_modes ?? []) {
			const name = (mode.name ?? '').toLowerCase();
			if (name.includes('single player') || name.includes('singleplayer')) add('single-player');
			if (name.includes('multiplayer') && !name.includes('mmo')) add('multiplayer');
			if (name.includes('co-op') || name.includes('cooperative')) add('co-op');
		}
		for (const genre of game.genres ?? []) {
			if (genre.name) add(translateGenreTag(genre.name));
		}

		const frontmatter = buildFrontmatter(COLLECTION_BY_MEDIA_TYPE.game, tags, poster);
		const embed = poster ? `\n\n${posterEmbed(poster)}` : '';
		return `${frontmatter}${embed}\n\n## Links\n${url}\n\n## Description\n${description}\n`;
	}

	/** `cover_big` (227x320) is plenty for a 200-300px poster. */
	getPosterUrl(game: IgdbGame): string | null {
		const imageId = game.cover?.image_id;
		return imageId ? `${IMAGE_URL}/t_cover_big/${imageId}.jpg` : null;
	}
}
