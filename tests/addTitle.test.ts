import { describe, expect, it, vi } from 'vitest';
import type { MediaClient, SearchResult } from '../src/api/types';
import { addTitle, AddTitleDeps } from '../src/core/addTitle';

interface FakeDetails {
	id: string;
	poster: string | null;
}

function fakeClient(results: SearchResult[]): MediaClient<FakeDetails> {
	return {
		mediaType: 'movie',
		search: vi.fn().mockResolvedValue(results),
		getDetails: vi.fn((id: string) => Promise.resolve({ id, poster: `/p${id}.jpg` })),
		getFilename: (d) => `Film ${d.id} (2010).md`,
		formatNote: (d, poster) => `note ${d.id} poster=${poster ?? 'none'}`,
		getPosterUrl: (d) => d.poster,
	};
}

function r(id: string, title: string, year: string): SearchResult {
	return { id, title, year, overview: '', thumbnailUrl: null };
}

function deps(
	client: MediaClient<FakeDetails>,
	overrides: Partial<AddTitleDeps<FakeDetails>> = {},
) {
	const notes = new Map<string, string>();
	const binaries = new Map<string, ArrayBuffer>();
	const d: AddTitleDeps<FakeDetails> = {
		client,
		folder: 'Media',
		pick: vi.fn().mockResolvedValue(null),
		confirm: vi.fn().mockResolvedValue(false),
		fileExists: (p) => notes.has(p),
		writeNote: (p, c) => {
			notes.set(p, c);
			return Promise.resolve();
		},
		writeBinary: (p, b) => {
			binaries.set(p, b);
			return Promise.resolve();
		},
		fetchPoster: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
		...overrides,
	};
	return { d, notes, binaries };
}

describe('addTitle', () => {
	it('auto-selects an exact match and writes the note and poster', async () => {
		const client = fakeClient([r('1', 'Film', '2010'), r('2', 'Film Two', '2012')]);
		const { d, notes, binaries } = deps(client);

		const outcome = await addTitle('Film', d);

		expect(outcome).toEqual({ status: 'created', path: 'Media/Film 1 (2010).md' });
		expect(client.search).toHaveBeenCalledWith('Film');
		expect(d.pick).not.toHaveBeenCalled();
		expect(notes.get('Media/Film 1 (2010).md')).toBe('note 1 poster=Film 1 (2010).jpg');
		expect([...binaries.keys()]).toEqual(['Media/Film 1 (2010).jpg']);
	});

	it('searches without the year and uses it to narrow results', async () => {
		const client = fakeClient([r('1', 'Film', '1990'), r('2', 'Film', '2010')]);
		const { d } = deps(client);
		const outcome = await addTitle('Film (2010)', d);
		expect(client.search).toHaveBeenCalledWith('Film');
		expect(outcome).toMatchObject({ status: 'created', path: 'Media/Film 2 (2010).md' });
	});

	it('writes to the vault root when the folder is empty', async () => {
		const { d } = deps(fakeClient([r('1', 'Film', '2010')]), { folder: '' });
		expect(await addTitle('Film', d)).toMatchObject({ path: 'Film 1 (2010).md' });
	});

	it('asks the user when several results remain, and honors a skip', async () => {
		const results = [r('1', 'Alpha', '2010'), r('2', 'Beta', '2011')];
		const { d, notes } = deps(fakeClient(results));
		expect(await addTitle('Something', d)).toEqual({ status: 'skipped', reason: 'Skipped' });
		expect(d.pick).toHaveBeenCalledWith('Something', results);
		expect(notes.size).toBe(0);
	});

	it('uses the result the user picks', async () => {
		const results = [r('1', 'Alpha', '2010'), r('2', 'Beta', '2011')];
		const { d } = deps(fakeClient(results), {
			pick: vi.fn().mockResolvedValue(results[1]),
		});
		expect(await addTitle('Something', d)).toMatchObject({ path: 'Media/Film 2 (2010).md' });
	});

	it('reports no results and search errors', async () => {
		const { d } = deps(fakeClient([]));
		expect(await addTitle('Nothing', d)).toEqual({
			status: 'failed',
			message: 'No results found for "Nothing"',
		});

		const broken = fakeClient([]);
		broken.search = vi.fn().mockRejectedValue(new Error('Request failed, status 401'));
		const { d: d2 } = deps(broken);
		expect(await addTitle('X', d2)).toEqual({
			status: 'failed',
			message: 'Search failed: Request failed, status 401',
		});
	});

	it('reports a details failure, such as a missing year', async () => {
		const client = fakeClient([r('1', 'Film', '2010')]);
		client.getFilename = () => {
			throw new Error('Could not determine release year');
		};
		const { d } = deps(client);
		expect(await addTitle('Film', d)).toEqual({
			status: 'failed',
			message: 'Could not fetch details: Could not determine release year',
		});
	});

	it('asks before overwriting, and skips on no', async () => {
		const { d, notes } = deps(fakeClient([r('1', 'Film', '2010')]));
		notes.set('Media/Film 1 (2010).md', 'old');
		expect(await addTitle('Film', d)).toEqual({ status: 'skipped', reason: 'Already exists' });
		expect(notes.get('Media/Film 1 (2010).md')).toBe('old');
	});

	it('overwrites on yes', async () => {
		const { d, notes } = deps(fakeClient([r('1', 'Film', '2010')]), {
			confirm: vi.fn().mockResolvedValue(true),
		});
		notes.set('Media/Film 1 (2010).md', 'old');
		await addTitle('Film', d);
		expect(notes.get('Media/Film 1 (2010).md')).toContain('note 1');
	});

	it('still writes the note when the poster fails', async () => {
		const { d, notes, binaries } = deps(fakeClient([r('1', 'Film', '2010')]), {
			fetchPoster: vi.fn().mockRejectedValue(new Error('404')),
		});
		expect(await addTitle('Film', d)).toEqual({
			status: 'created',
			path: 'Media/Film 1 (2010).md',
			posterWarning: 'Poster download failed: 404',
		});
		expect(notes.get('Media/Film 1 (2010).md')).toBe('note 1 poster=none');
		expect(binaries.size).toBe(0);
	});

	it('notes when there is no poster', async () => {
		const client = fakeClient([r('1', 'Film', '2010')]);
		client.getPosterUrl = () => null;
		const { d } = deps(client);
		expect(await addTitle('Film', d)).toMatchObject({ posterWarning: 'No poster available' });
		expect(d.fetchPoster).not.toHaveBeenCalled();
	});

	it('reports a failed note write', async () => {
		const { d } = deps(fakeClient([r('1', 'Film', '2010')]), {
			writeNote: () => Promise.reject(new Error('disk full')),
		});
		expect(await addTitle('Film', d)).toEqual({
			status: 'failed',
			message: 'Could not write note: disk full',
		});
	});
});
