import { describe, expect, it, vi } from 'vitest';
import { TmdbClient, TmdbDetails } from '../src/api/tmdb';
import movieDetails from './fixtures/tmdb_movie_details.json';
import movieSearch from './fixtures/tmdb_movie_search.json';
import tvDetails from './fixtures/tmdb_tv_details.json';
import tvSearch from './fixtures/tmdb_tv_search.json';

// Expected text was produced by the Python CLI's TMDBClient.format_note_content
// on the same fixtures, so these tests pin the plugin to the CLI's output.
const CLI_MOVIE_NOTE =
	'---\ncollection: "[[Movies]]"\ntags:\n  - action\n  - sci-fi\n  - thriller\n---\n\n## Links\nhttps://www.imdb.com/title/tt1375666\n\n## Description\nA thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O. Directed by [[Christopher Nolan]]. Starring Cobb ([[Leonardo DiCaprio]]), Arthur ([[Joseph Gordon-Levitt]]).\n';
const CLI_TV_NOTE =
	'---\ncollection: "[[Series]]"\ntags:\n  - comedy\n---\n\n## Links\nhttps://www.imdb.com/title/tt15398010\n\n## Description\nA woman whose husband suddenly dies sets out to discover what happened to the billions of dollars he left her. Created by [[Alan Yang]]. Starring Molly Novak ([[Maya Rudolph]]).\n';

function client(mediaType: 'movie' | 'tv', response: unknown = {}) {
	const getJson = vi.fn().mockResolvedValue(response);
	return { client: new TmdbClient('KEY', mediaType, getJson), getJson };
}

describe('TmdbClient.search', () => {
	it('builds the movie search URL and normalizes results', async () => {
		const { client: c, getJson } = client('movie', movieSearch);
		const results = await c.search('Inception & Co');

		const url = new URL(getJson.mock.calls[0]?.[0] as string);
		expect(url.origin + url.pathname).toBe('https://api.themoviedb.org/3/search/movie');
		expect(url.searchParams.get('api_key')).toBe('KEY');
		expect(url.searchParams.get('query')).toBe('Inception & Co');
		expect(url.searchParams.get('language')).toBe('en-US');

		expect(results[0]).toEqual({
			id: '27205',
			title: 'Inception',
			year: '2010',
			overview: movieSearch.results[0]?.overview,
			thumbnailUrl: 'https://image.tmdb.org/t/p/w92/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
		});
	});

	it('uses name and first_air_date for TV', async () => {
		const { client: c, getJson } = client('tv', tvSearch);
		const results = await c.search('Loot');
		expect(getJson.mock.calls[0]?.[0]).toContain('/search/tv?');
		expect(results.map((r) => [r.title, r.year])).toEqual([
			['Loot', '2022'],
			['Loot - Blood Treasure', '2022'],
		]);
	});

	it('handles missing results, dates and posters', async () => {
		const { client: c } = client('movie', {
			results: [{ id: 1, title: 'X', release_date: '', poster_path: null }],
		});
		expect(await c.search('X')).toEqual([
			{ id: '1', title: 'X', year: null, overview: '', thumbnailUrl: null },
		]);
		const { client: empty } = client('movie', {});
		expect(await empty.search('X')).toEqual([]);
	});

	it('passes request errors through', async () => {
		const getJson = vi.fn().mockRejectedValue(new Error('401'));
		await expect(new TmdbClient('K', 'movie', getJson).search('X')).rejects.toThrow('401');
	});
});

describe('TmdbClient.getDetails', () => {
	it('requests credits and external ids', async () => {
		const { client: c, getJson } = client('movie', movieDetails);
		await c.getDetails('27205');
		const url = new URL(getJson.mock.calls[0]?.[0] as string);
		expect(url.pathname).toBe('/3/movie/27205');
		expect(url.searchParams.get('append_to_response')).toBe('credits,external_ids');
	});
});

describe('TmdbClient notes', () => {
	const movie = client('movie').client;
	const tv = client('tv').client;

	it('matches the CLI for a movie', () => {
		expect(movie.formatNote(movieDetails as TmdbDetails)).toBe(CLI_MOVIE_NOTE);
	});

	it('matches the CLI for a TV show', () => {
		expect(tv.formatNote(tvDetails as TmdbDetails)).toBe(CLI_TV_NOTE);
	});

	it('adds the poster property and embed', () => {
		const note = movie.formatNote(movieDetails, 'Inception (2010).jpg');
		expect(note).toContain('  - thriller\nposter: "[[Inception (2010).jpg]]"\n---\n\n![[Inception (2010).jpg]]\n\n## Links\n');
	});

	it('falls back when optional fields are missing', () => {
		const note = movie.formatNote({ id: 1, title: 'X', release_date: '2001-01-01' });
		expect(note).toBe(
			'---\ncollection: "[[Movies]]"\n---\n\n## Links\nNot available\n\n## Description\nNo description available. Directed by Unknown. Starring .\n',
		);
		expect(tv.formatNote({ id: 1, name: 'Y' })).toContain('Created by Unknown.');
	});

	it('builds filenames', () => {
		expect(movie.getFilename(movieDetails as TmdbDetails)).toBe('Inception (2010).md');
		expect(tv.getFilename(tvDetails as TmdbDetails)).toBe('Loot (2022).md');
		expect(movie.getFilename({ id: 1, title: 'Star Wars: Episode IV', release_date: '1977-05-25' })).toBe(
			'Star Wars - Episode IV (1977).md',
		);
	});

	it('refuses a filename without a year', () => {
		expect(() => movie.getFilename({ id: 1, title: 'X' })).toThrow('release year');
	});

	it('builds the poster URL', () => {
		expect(movie.getPosterUrl(movieDetails as TmdbDetails)).toBe(
			'https://image.tmdb.org/t/p/original/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
		);
		expect(movie.getPosterUrl({ id: 1, poster_path: null })).toBeNull();
	});
});
