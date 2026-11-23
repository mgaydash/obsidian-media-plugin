import {
	AbstractInputSuggest,
	App,
	PluginSettingTab,
	SecretComponent,
	Setting,
	SettingDefinitionItem,
	TFolder,
} from 'obsidian';
import { LINK_TEXT_STYLES, LinkTextStyle } from './core/selection';
import type MediaNoteCreatorPlugin from './main';

export interface MediaNoteCreatorSettings {
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

export const DEFAULT_SETTINGS: MediaNoteCreatorSettings = {
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

/** Shared text, so both settings renderers say the same thing. */
const TEXT = {
	keysNote:
		'Keys are stored in the Obsidian Keychain, not in this plugin’s settings file. Albums and word lookups need no key.',
	tmdb: 'Movies and TV. Get one at themoviedb.org under Settings → API.',
	twitchId:
		'Games, from IGDB. Register an application at dev.twitch.tv to get a client ID and secret.',
	twitchSecret: 'Games, from IGDB.',
	googleBooks: 'Books. Create a key in the Google Cloud console with the Books API turned on.',
	notesFolder:
		'Where new notes go. Leave empty to use the default location for new notes from Obsidian’s own settings.',
	linkText:
		'When you add titles from selected text, each line becomes a link to its new note. Choose what the link shows.',
	posterWidth: 'Width in pixels. Height follows the image’s shape.',
};

/** A valid poster width: a whole number of pixels above zero. */
export function isValidPosterWidth(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

type SecretSettingKey =
	| 'tmdbSecretId'
	| 'igdbClientIdSecretId'
	| 'igdbClientSecretSecretId'
	| 'googleBooksSecretId';

export class MediaNoteCreatorSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: MediaNoteCreatorPlugin,
	) {
		super(app, plugin);
	}

	/**
	 * Declarative settings (Obsidian 1.13+), which also makes them appear in
	 * Obsidian's settings search. When this returns items, Obsidian does not
	 * call display(); display() stays for 1.11.4 to 1.12, below which this
	 * method is never called.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'group',
				heading: 'API keys',
				items: [
					{ name: 'Where keys are stored', desc: TEXT.keysNote, searchable: false },
					{
						name: 'TMDB API key',
						desc: TEXT.tmdb,
						aliases: ['movies', 'TV'],
						control: { type: 'secret', key: 'tmdbSecretId' },
					},
					{
						name: 'Twitch client ID',
						desc: TEXT.twitchId,
						aliases: ['games', 'IGDB'],
						control: { type: 'secret', key: 'igdbClientIdSecretId' },
					},
					{
						name: 'Twitch client secret',
						desc: TEXT.twitchSecret,
						aliases: ['games', 'IGDB'],
						control: { type: 'secret', key: 'igdbClientSecretSecretId' },
					},
					{
						name: 'Google Books API key',
						desc: TEXT.googleBooks,
						aliases: ['books'],
						control: { type: 'secret', key: 'googleBooksSecretId' },
					},
				],
			},
			{
				type: 'group',
				heading: 'Notes',
				items: [
					{
						name: 'Notes folder',
						desc: TEXT.notesFolder,
						control: {
							type: 'folder',
							key: 'notesFolder',
							placeholder: 'Default location',
						},
					},
					{
						name: 'Link text',
						desc: TEXT.linkText,
						control: { type: 'dropdown', key: 'linkText', options: LINK_TEXT_STYLES },
					},
					{
						name: 'Poster width',
						desc: TEXT.posterWidth,
						aliases: ['cover', 'image size'],
						control: {
							type: 'number',
							key: 'posterWidth',
							placeholder: String(DEFAULT_SETTINGS.posterWidth),
							defaultValue: DEFAULT_SETTINGS.posterWidth,
							min: 1,
							step: 1,
							validate: (value) =>
								isValidPosterWidth(value) ? undefined : 'Enter a whole number above zero.',
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof MediaNoteCreatorSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;
		switch (key) {
			case 'tmdbSecretId':
			case 'igdbClientIdSecretId':
			case 'igdbClientSecretSecretId':
			case 'googleBooksSecretId':
				settings[key] = typeof value === 'string' ? value : '';
				break;
			case 'notesFolder':
				settings.notesFolder = typeof value === 'string' ? value.trim() : '';
				break;
			case 'linkText':
				if (typeof value === 'string' && value in LINK_TEXT_STYLES) {
					settings.linkText = value as LinkTextStyle;
				}
				break;
			case 'posterWidth':
				if (!isValidPosterWidth(value)) return;
				settings.posterWidth = value;
				break;
			default:
				return;
		}
		await this.plugin.saveSettings();
	}

	/** Imperative settings, for Obsidian versions before 1.13. */
	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl).setName('API keys').setHeading();
		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text: TEXT.keysNote,
		});
		this.secretSetting('TMDB API key', TEXT.tmdb, 'tmdbSecretId');
		this.secretSetting('Twitch client ID', TEXT.twitchId, 'igdbClientIdSecretId');
		this.secretSetting('Twitch client secret', TEXT.twitchSecret, 'igdbClientSecretSecretId');
		this.secretSetting('Google Books API key', TEXT.googleBooks, 'googleBooksSecretId');

		new Setting(containerEl).setName('Notes').setHeading();
		new Setting(containerEl)
			.setName('Notes folder')
			.setDesc(TEXT.notesFolder)
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
			.setDesc(TEXT.linkText)
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
			.setDesc(TEXT.posterWidth)
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.posterWidth))
					.setValue(String(settings.posterWidth))
					.onChange(async (value) => {
						const width = Number.parseInt(value, 10);
						if (isValidPosterWidth(width)) {
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
