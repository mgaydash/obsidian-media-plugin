import { MarkdownFileInfo, Notice, TFile } from 'obsidian';
import { TmdbClient } from '../api/tmdb';
import { addTitle } from '../core/addTitle';
import type { MediaType } from '../core/notes';
import {
	captureSelection,
	linkChanges,
	SelectionSegment,
} from '../core/selection';
import { normalizeTitles } from '../core/titles';
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

	// Selected text in the open note fills the prompt, one title per line.
	// Remember where it was so those lines can be linked afterwards.
	const view = app.workspace.activeEditor;
	const sourceFile = view?.file ?? null;
	const segments: SelectionSegment[] =
		view?.editor && sourceFile ? captureSelection(view.editor) : [];
	const titles = await new TitleInputModal(
		app,
		LABELS[mediaType],
		normalizeTitles(segments.map((s) => s.parsed.title)),
	).openAndWait();
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
	const created = new Map<string, TFile>();

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
			const file = app.vault.getAbstractFileByPath(outcome.path);
			if (file instanceof TFile) created.set(input, file);
			const warning = outcome.posterWarning ? ` (${outcome.posterWarning})` : '';
			new Notice(`Created ${outcome.path}${warning}`);
		} else if (outcome.status === 'skipped') {
			new Notice(`${input}: ${outcome.reason}`);
		} else {
			new Notice(`${input}: ${outcome.message}`, 8000);
		}
	}

	if (segments.length > 0) {
		linkSelection(plugin, view, sourceFile, segments, created);
	} else if (titles.length === 1) {
		// With a single typed title, open the new note, which is usually what you want next.
		const file = [...created.values()][0];
		if (file) await app.workspace.getLeaf(false).openFile(file);
	}
}

/** Turn each selected line that produced a note into a link to it. */
function linkSelection(
	plugin: MediaNotesPlugin,
	view: MarkdownFileInfo | null,
	sourceFile: TFile | null,
	segments: SelectionSegment[],
	created: Map<string, TFile>,
): void {
	if (created.size === 0 || !view?.editor || !sourceFile) return;
	// The same view may have moved on to another note while titles were added.
	if (view.file?.path !== sourceFile.path) {
		new Notice(`Did not add links: ${sourceFile.basename} is no longer open.`);
		return;
	}
	const { editor } = view;
	const changes = linkChanges(editor, segments, created, (file, display) =>
		plugin.app.fileManager.generateMarkdownLink(
			file,
			sourceFile.path,
			undefined,
			display === file.basename ? undefined : display,
		),
	);
	if (changes.length > 0) editor.transaction({ changes });
}
