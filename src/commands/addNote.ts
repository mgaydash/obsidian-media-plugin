import { MarkdownFileInfo, Notice, TFile } from 'obsidian';
import { createClient } from './clients';
import { addTitle } from '../core/addTitle';
import type { MediaType } from '../core/notes';
import {
	captureSelection,
	linkChanges,
	linkDisplayText,
	SelectionSegment,
} from '../core/selection';
import { normalizeTitles } from '../core/titles';
import type MediaNotesPlugin from '../main';
import { getBytes } from '../obsidian/http';
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

/** Command id, command name and prompt heading for each media type. */
const COMMANDS: Record<MediaType, { id: string; name: string; heading: string }> = {
	movie: { id: 'add-movie-note', name: 'Add movie note', heading: 'Add movie notes' },
	tv: { id: 'add-tv-note', name: 'Add TV note', heading: 'Add TV notes' },
	game: { id: 'add-game-note', name: 'Add game note', heading: 'Add game notes' },
	album: { id: 'add-album-note', name: 'Add album note', heading: 'Add album notes' },
	book: { id: 'add-book-note', name: 'Add book note', heading: 'Add book notes' },
	lookup: { id: 'add-word-lookup', name: 'Add word lookup', heading: 'Add word lookups' },
};

export function registerAddCommands(plugin: MediaNotesPlugin): void {
	for (const [mediaType, command] of Object.entries(COMMANDS) as [MediaType, (typeof COMMANDS)[MediaType]][]) {
		plugin.addCommand({
			id: command.id,
			name: command.name,
			callback: () => void runAdd(plugin, mediaType),
		});
	}
}

async function runAdd(
	plugin: MediaNotesPlugin,
	mediaType: MediaType,
): Promise<void> {
	const { app } = plugin;
	const client = createClient(plugin, mediaType);
	if (typeof client === 'string') {
		new Notice(client);
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
		COMMANDS[mediaType].heading,
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

	const width = plugin.settings.posterWidth;
	const created = new Map<string, CreatedNote>();

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
			const file = app.vault.getFileByPath(outcome.path);
			if (file) {
				created.set(input, { file, title: outcome.title, year: outcome.year });
			}
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
		const file = [...created.values()][0]?.file;
		if (file) await app.workspace.getLeaf(false).openFile(file);
	}
}

interface CreatedNote {
	file: TFile;
	title: string;
	year: string | null;
}

/** Turn each selected line that produced a note into a link to it. */
function linkSelection(
	plugin: MediaNotesPlugin,
	view: MarkdownFileInfo | null,
	sourceFile: TFile | null,
	segments: SelectionSegment[],
	created: Map<string, CreatedNote>,
): void {
	if (created.size === 0 || !view?.editor || !sourceFile) return;
	// The same view may have moved on to another note while titles were added.
	if (view.file?.path !== sourceFile.path) {
		new Notice(`Did not add links: ${sourceFile.basename} is no longer open.`);
		return;
	}
	const { editor } = view;
	const style = plugin.settings.linkText;
	const changes = linkChanges(editor, segments, created, (note, typed) =>
		plugin.app.fileManager.generateMarkdownLink(
			note.file,
			sourceFile.path,
			undefined,
			linkDisplayText(style, { ...note, basename: note.file.basename }, typed) ??
				undefined,
		),
	);
	if (changes.length > 0) editor.transaction({ changes });
}
