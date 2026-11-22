import { Plugin } from 'obsidian';
import { registerAddCommands } from './commands/addNote';
import { LINK_TEXT_STYLES } from './core/selection';
import {
	DEFAULT_SETTINGS,
	MediaNotesSettings,
	MediaNotesSettingTab,
} from './settings';

export default class MediaNotesPlugin extends Plugin {
	settings!: MediaNotesSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new MediaNotesSettingTab(this.app, this));
		registerAddCommands(this);
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<MediaNotesSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...saved };
		if (!(this.settings.linkText in LINK_TEXT_STYLES)) {
			this.settings.linkText = DEFAULT_SETTINGS.linkText;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Read a value from the Obsidian Keychain. */
	getSecret(id: string): string | null {
		if (!id) return null;
		return this.app.secretStorage.getSecret(id);
	}
}
