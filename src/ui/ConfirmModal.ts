import { App, Modal, Setting } from 'obsidian';

/** Yes/no question. Closing the modal counts as no. */
export class ConfirmModal extends Modal {
	private answer = false;
	private resolve: ((answer: boolean) => void) | null = null;

	constructor(
		app: App,
		private readonly message: string,
	) {
		super(app);
	}

	openAndWait(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		this.contentEl.createEl('p', { text: this.message });
		new Setting(this.contentEl)
			.addButton((b) =>
				b.setButtonText('No').onClick(() => this.close()),
			)
			.addButton((b) =>
				b
					.setButtonText('Yes')
					.setCta()
					.onClick(() => {
						this.answer = true;
						this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolve?.(this.answer);
		this.resolve = null;
	}
}
