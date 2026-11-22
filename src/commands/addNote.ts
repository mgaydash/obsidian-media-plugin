import { Notice, TFile } from 'obsidian';
import { TmdbClient } from '../api/tmdb';
import { addTitle } from '../core/addTitle';
import type { MediaType } from '../core/notes';
import type MediaNotesPlugin from '../main';
import { getBytes, getJson } from '../obsidian/http';
import { resizeToJpeg } from '../obsidian/poster';
import {
	fileExists,
	resolveNotesFolder,
	writeBinary,
	writeNote,
} from '../obsidian/vault';
import { ConfirmModal } from '../ui/ConfirmModal';
import { ResultSuggestModal } from '../ui/ResultSuggestModal';
import { TitleInputModal } from '../ui/TitleInputModal';

const LABELS: Record<MediaType, string> = {
	movie: 'Add movie notes',
	tv: 'Add TV notes',
};

export function registerAddCommands(plugin: MediaNotesPlugin): void {
	plugin.addCommand({
		id: 'add-movie-note',
		name: 'Add movie note',
		callback: () => void runAdd(plugin, 'movie'),
	});
	plugin.addCommand({
		id: 'add-tv-note',
		name: 'Add TV note',
		callback: () => void runAdd(plugin, 'tv'),
	});
}

async function runAdd(
	plugin: MediaNotesPlugin,
	mediaType: MediaType,
): Promise<void> {
	const { app } = plugin;
	const apiKey = plugin.getSecret(plugin.settings.tmdbSecretId);
	if (!apiKey) {
		new Notice('Add your TMDB API key in the Media Notes settings first.');
		return;
	}

	const titles = await new TitleInputModal(app, LABELS[mediaType]).openAndWait();
	if (titles.length === 0) return;

	let folder: string;
	try {
		folder = await resolveNotesFolder(app, plugin.settings.notesFolder);
	} catch (err) {
		new Notice(`Could not use the notes folder: ${String(err)}`);
		return;
	}

	const client = new TmdbClient(apiKey, mediaType, getJson);
	const width = plugin.settings.posterWidth;
	const created: string[] = [];

	for (const input of titles) {
		const outcome = await addTitle(input, {
			client,
			folder,
			pick: (title, results) =>
				new ResultSuggestModal(app, title, results).openAndWait(),
			confirm: (message) => new ConfirmModal(app, message).openAndWait(),
			fileExists: (path) => fileExists(app, path),
			writeNote: (path, content) => writeNote(app, path, content),
			writeBinary: (path, data) => writeBinary(app, path, data),
			fetchPoster: async (url) => resizeToJpeg(await getBytes(url), width),
		});

		if (outcome.status === 'created') {
			created.push(outcome.path);
			const warning = outcome.posterWarning ? ` (${outcome.posterWarning})` : '';
			new Notice(`Created ${outcome.path}${warning}`);
		} else if (outcome.status === 'skipped') {
			new Notice(`${input}: ${outcome.reason}`);
		} else {
			new Notice(`${input}: ${outcome.message}`, 8000);
		}
	}

	// With a single title, open the new note, which is usually what you want next.
	if (titles.length === 1 && created[0]) {
		const file = app.vault.getAbstractFileByPath(created[0]);
		if (file instanceof TFile) await app.workspace.getLeaf(false).openFile(file);
	}
}
