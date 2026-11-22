import { Notice, normalizePath } from 'obsidian';
import { planScaffold, SCAFFOLD_MEDIA_TYPES } from '../core/scaffold';
import type MediaNoteCreatorPlugin from '../main';
import { fileExists, resolveNotesFolder } from '../obsidian/vault';
import { ConfirmModal } from '../ui/ConfirmModal';

export function registerScaffoldCommand(plugin: MediaNoteCreatorPlugin): void {
	plugin.addCommand({
		id: 'create-collection-pages',
		name: 'Create collection pages and bases',
		callback: () => void runScaffold(plugin),
	});
}

async function runScaffold(plugin: MediaNoteCreatorPlugin): Promise<void> {
	const { app } = plugin;
	let folder: string;
	try {
		folder = await resolveNotesFolder(app, plugin.settings.notesFolder);
	} catch (err) {
		new Notice(`Could not use the notes folder: ${String(err)}`);
		return;
	}
	const pathOf = (name: string) => normalizePath(folder ? `${folder}/${name}` : name);

	// A page anywhere in the vault already answers [[Movies]], so check by link,
	// not only by path in the notes folder.
	const plan = planScaffold(SCAFFOLD_MEDIA_TYPES, (name) => {
		const linkpath = name.endsWith('.md') ? name.slice(0, -3) : name;
		return (
			app.metadataCache.getFirstLinkpathDest(linkpath, '') !== null ||
			fileExists(app, pathOf(name))
		);
	});

	if (plan.create.length === 0) {
		new Notice('All collection pages and bases already exist.');
		return;
	}

	const where = folder ? `in ${folder}` : 'at the top of the vault';
	const skipped =
		plan.skip.length > 0 ? ` Already there, left as they are: ${plan.skip.join(', ')}.` : '';
	const ok = await new ConfirmModal(
		app,
		`Create ${plan.create.length} files ${where}: ${plan.create.map((f) => f.name).join(', ')}?${skipped}`,
	).openAndWait();
	if (!ok) return;

	let created = 0;
	for (const file of plan.create) {
		try {
			await app.vault.create(pathOf(file.name), file.content);
			created++;
		} catch (err) {
			new Notice(`Could not create ${file.name}: ${String(err)}`, 8000);
		}
	}
	new Notice(`Created ${created} collection files ${where}.`);
}
