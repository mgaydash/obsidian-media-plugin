import { App, normalizePath, TFolder } from 'obsidian';

/**
 * The folder new notes go in, as a vault path ('' for the root).
 * Uses the plugin's folder setting when set, otherwise Obsidian's
 * "Default location for new notes".
 */
export async function resolveNotesFolder(
	app: App,
	override: string,
): Promise<string> {
	if (override) {
		const path = normalizePath(override);
		const existing = app.vault.getAbstractFileByPath(path);
		if (!existing) await app.vault.createFolder(path);
		else if (!(existing instanceof TFolder)) {
			throw new Error(`"${path}" is a file, not a folder`);
		}
		return path === '/' ? '' : path;
	}
	const activePath = app.workspace.getActiveFile()?.path ?? '';
	const folder = app.fileManager.getNewFileParent(activePath);
	return folder.isRoot() ? '' : folder.path;
}

export function fileExists(app: App, path: string): boolean {
	return app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
}

export async function writeNote(
	app: App,
	path: string,
	content: string,
): Promise<void> {
	const existing = app.vault.getFileByPath(normalizePath(path));
	// process() is the guideline way to replace a file's text in the background.
	if (existing) await app.vault.process(existing, () => content);
	else await app.vault.create(normalizePath(path), content);
}

export async function writeBinary(
	app: App,
	path: string,
	data: ArrayBuffer,
): Promise<void> {
	const existing = app.vault.getFileByPath(normalizePath(path));
	if (existing) await app.vault.modifyBinary(existing, data);
	else await app.vault.createBinary(normalizePath(path), data);
}
