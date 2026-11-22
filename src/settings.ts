import {
	AbstractInputSuggest,
	App,
	PluginSettingTab,
	SecretComponent,
	Setting,
	TFolder,
} from 'obsidian';
import { LINK_TEXT_STYLES, LinkTextStyle } from './core/selection';
import type MediaNotesPlugin from './main';

export interface MediaNotesSettings {
	/**
	 * Name of the Keychain entry holding the TMDB API key. The key itself is
	 * kept in Obsidian's Keychain, never in this plugin's data.json.
	 */
	tmdbSecretId: string;
	/** Folder for new notes. Empty means Obsidian's "Default location for new notes". */
	notesFolder: string;
	/** Poster width in pixels. */
	posterWidth: number;
	/** Display text for links made from selected lines. */
	linkText: LinkTextStyle;
}

export const DEFAULT_SETTINGS: MediaNotesSettings = {
	tmdbSecretId: '',
	notesFolder: '',
	posterWidth: 200,
	linkText: 'title-year',
};

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(
		app: App,
		private readonly input: HTMLInputElement,
	) {
		super(app, input);
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault
			.getAllFolders(false)
			.filter((f) => f.path.toLowerCase().includes(q));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		this.input.dispatchEvent(new Event('input'));
		this.close();
	}
}

export class MediaNotesSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: MediaNotesPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName('TMDB API key')
			.setDesc(
				'Used for movies and TV. Stored in the Obsidian Keychain. Get a key at themoviedb.org under Settings → API.',
			)
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(settings.tmdbSecretId)
					.onChange(async (value) => {
						settings.tmdbSecretId = value ?? '';
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Notes folder')
			.setDesc(
				'Where new notes go. Leave empty to use the default location for new notes from Obsidian’s own settings.',
			)
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl);
				text
					.setPlaceholder('Default location')
					.setValue(settings.notesFolder)
					.onChange(async (value) => {
						settings.notesFolder = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Link text')
			.setDesc(
				'When you add titles from selected text, each line becomes a link to its new note. Choose what the link shows.',
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(LINK_TEXT_STYLES)
					.setValue(settings.linkText)
					.onChange(async (value) => {
						settings.linkText = value as LinkTextStyle;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Poster width')
			.setDesc('Width in pixels. Height follows the image’s shape.')
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.posterWidth))
					.setValue(String(settings.posterWidth))
					.onChange(async (value) => {
						const width = Number.parseInt(value, 10);
						if (Number.isFinite(width) && width > 0) {
							settings.posterWidth = width;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
