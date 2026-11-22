import { App, Modal, Setting } from 'obsidian';
import { splitTitles } from '../core/titles';

/**
 * Asks for one or more titles, one per line. Resolves with the titles, or an
 * empty list when the modal is closed without submitting.
 */
export class TitleInputModal extends Modal {
	private titles: string[] = [];
	private resolve: ((titles: string[]) => void) | null = null;

	constructor(
		app: App,
		private readonly heading: string,
	) {
		super(app);
	}

	openAndWait(): Promise<string[]> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle(this.heading);
		contentEl.createEl('p', {
			text: 'One title per line. Add the year in parentheses to pick the right one.',
		});
		const textarea = contentEl.createEl('textarea', {
			cls: 'media-notes-titles',
			attr: { rows: '6', placeholder: 'Inception (2010)' },
		});

		const submit = () => {
			this.titles = splitTitles(textarea.value);
			this.close();
		};
		textarea.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' && (evt.metaKey || evt.ctrlKey)) {
				evt.preventDefault();
				submit();
			}
		});

		new Setting(contentEl).addButton((button) =>
			button.setButtonText('Add').setCta().onClick(submit),
		);
		window.setTimeout(() => textarea.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolve?.(this.titles);
		this.resolve = null;
	}
}
