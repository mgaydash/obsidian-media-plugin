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
	/** Keychain entries for IGDB (games), which signs in through Twitch. */
	igdbClientIdSecretId: string;
	igdbClientSecretSecretId: string;
	/** Keychain entry for the Google Books API key. */
	googleBooksSecretId: string;
	/** Folder for new notes. Empty means Obsidian's "Default location for new notes". */
	notesFolder: string;
	/** Poster width in pixels. */
	posterWidth: number;
	/** Display text for links made from selected lines. */
	linkText: LinkTextStyle;
}

export const DEFAULT_SETTINGS: MediaNotesSettings = {
	tmdbSecretId: '',
	igdbClientIdSecretId: '',
	igdbClientSecretSecretId: '',
	googleBooksSecretId: '',
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

type SecretSettingKey =
	| 'tmdbSecretId'
	| 'igdbClientIdSecretId'
	| 'igdbClientSecretSecretId'
	| 'googleBooksSecretId';

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

		new Setting(containerEl).setName('API keys').setHeading();
		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'Keys are stored in the Obsidian Keychain, not in this plugin’s settings file. Albums need no key.',
		});
		this.secretSetting(
			'TMDB API key',
			'Movies and TV. Get one at themoviedb.org under Settings → API.',
			'tmdbSecretId',
		);
		this.secretSetting(
			'Twitch client ID',
			'Games, from IGDB. Register an application at dev.twitch.tv to get a client ID and secret.',
			'igdbClientIdSecretId',
		);
		this.secretSetting('Twitch client secret', 'Games, from IGDB.', 'igdbClientSecretSecretId');
		this.secretSetting(
			'Google Books API key',
			'Books. Create a key in the Google Cloud console with the Books API turned on.',
			'googleBooksSecretId',
		);

		new Setting(containerEl).setName('Notes').setHeading();
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

	/** A setting that picks a Keychain entry and stores only its name. */
	private secretSetting(name: string, desc: string, key: SecretSettingKey): void {
		const settings = this.plugin.settings;
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(settings[key])
					.onChange(async (value) => {
						settings[key] = value ?? '';
						await this.plugin.saveSettings();
					}),
			);
	}
}
