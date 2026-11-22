/**
 * The "add a title" workflow, ported from the CLI's `process_title()`.
 *
 * Everything Obsidian-specific (modals, the vault, image resizing) is passed
 * in, so this file can be tested without Obsidian.
 */
import type { MediaClient, SearchResult } from '../api/types';
import { selectResult } from './disambiguation';
import { extractTitleAndYear } from './titles';

export interface AddTitleDeps<Details> {
	client: MediaClient<Details>;
	/** Folder path for new notes; '' means the vault root. */
	folder: string;
	/** Ask the user to pick one result. Resolves null when they skip. */
	pick(title: string, results: SearchResult[]): Promise<SearchResult | null>;
	/** Ask a yes/no question. */
	confirm(message: string): Promise<boolean>;
	fileExists(path: string): boolean;
	/** Create or replace a note. */
	writeNote(path: string, content: string): Promise<void>;
	/** Create or replace a binary file. */
	writeBinary(path: string, data: ArrayBuffer): Promise<void>;
	/** Download a poster and return it resized as JPEG bytes. */
	fetchPoster(url: string): Promise<ArrayBuffer>;
}

export type AddOutcome =
	| {
			status: 'created';
			path: string;
			/** Title and year as the API shows them, for link text. */
			title: string;
			year: string | null;
			posterWarning?: string;
	  }
	| { status: 'skipped'; reason: string }
	| { status: 'failed'; message: string };

function joinPath(folder: string, name: string): string {
	return folder ? `${folder}/${name}` : name;
}

function errorText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export async function addTitle<Details>(
	input: string,
	deps: AddTitleDeps<Details>,
): Promise<AddOutcome> {
	const { client } = deps;
	const { title, year } = extractTitleAndYear(input);

	let results: SearchResult[];
	try {
		results = await client.search(title);
	} catch (err) {
		return { status: 'failed', message: `Search failed: ${errorText(err)}` };
	}

	const selection = selectResult(results, title, year);
	let selected: SearchResult | null;
	if (selection.kind === 'none') {
		return { status: 'failed', message: `No results found for "${title}"` };
	} else if (selection.kind === 'ask') {
		selected = await deps.pick(title, selection.results);
		if (!selected) return { status: 'skipped', reason: 'Skipped' };
	} else {
		selected = selection.result;
		// A game with no release date is often an announcement, not a game yet.
		// Only on the exact-match path, as in the CLI: picking from the list is
		// already a deliberate choice.
		if (
			client.mediaType === 'game' &&
			selection.reason === 'exact' &&
			selected.year === null
		) {
			const add = await deps.confirm(
				`"${selected.title}" has no release date yet. Add it anyway?`,
			);
			if (!add) return { status: 'skipped', reason: 'Unreleased' };
		}
	}

	let details: Details;
	let filename: string;
	try {
		details = await client.getDetails(selected.id);
		filename = client.getFilename(details);
	} catch (err) {
		return {
			status: 'failed',
			message: `Could not fetch details: ${errorText(err)}`,
		};
	}

	const notePath = joinPath(deps.folder, filename);
	if (deps.fileExists(notePath)) {
		const overwrite = await deps.confirm(
			`"${notePath}" already exists. Overwrite it?`,
		);
		if (!overwrite) return { status: 'skipped', reason: 'Already exists' };
	}

	let poster: string | undefined;
	let posterWarning: string | undefined;
	const posterUrl = client.getPosterUrl(details);
	if (posterUrl) {
		const posterName = filename.replace(/\.md$/, '.jpg');
		try {
			const bytes = await deps.fetchPoster(posterUrl);
			await deps.writeBinary(joinPath(deps.folder, posterName), bytes);
			poster = posterName;
		} catch (err) {
			posterWarning = `Poster download failed: ${errorText(err)}`;
		}
	} else if (client.mediaType !== 'lookup') {
		// Words never have cover art, so saying so would be noise.
		posterWarning = 'No poster available';
	}

	try {
		await deps.writeNote(notePath, client.formatNote(details, poster));
	} catch (err) {
		return {
			status: 'failed',
			message: `Could not write note: ${errorText(err)}`,
		};
	}

	const created = { status: 'created' as const, path: notePath, ...client.getTitleAndYear(details) };
	return posterWarning ? { ...created, posterWarning } : created;
}
