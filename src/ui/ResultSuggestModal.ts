import { App, SuggestModal } from 'obsidian';
import type { SearchResult } from '../api/types';

/**
 * Searchable pick list of API results. Resolves with the chosen result, or
 * null when the user presses Esc.
 */
export class ResultSuggestModal extends SuggestModal<SearchResult> {
	private chosen: SearchResult | null = null;
	private resolve: ((result: SearchResult | null) => void) | null = null;

	constructor(
		app: App,
		title: string,
		private readonly results: SearchResult[],
		attribution?: string,
	) {
		super(app);
		this.setPlaceholder(`Several matches for "${title}". Pick one, or press Esc to skip.`);
		if (attribution) {
			this.modalEl.createDiv({ cls: 'media-note-creator-attribution', text: attribution });
		}
	}

	openAndWait(): Promise<SearchResult | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	getSuggestions(query: string): SearchResult[] {
		const q = query.toLowerCase().trim();
		if (!q) return this.results;
		return this.results.filter((r) => r.title.toLowerCase().includes(q));
	}

	renderSuggestion(result: SearchResult, el: HTMLElement): void {
		el.addClass('media-note-creator-suggestion');
		if (result.thumbnailUrl) {
			const img = el.createEl('img', {
				cls: 'media-note-creator-thumb',
				attr: { src: result.thumbnailUrl, alt: '' },
			});
			// Not every album has cover art; drop the broken image.
			img.addEventListener('error', () => img.remove());
		}
		const text = el.createDiv();
		text.createDiv({
			text: result.year ? `${result.title} (${result.year})` : result.title,
		});
		if (result.overview) {
			const overview =
				result.overview.length > 100
					? `${result.overview.slice(0, 100)}…`
					: result.overview;
			text.createEl('small', { text: overview, cls: 'media-note-creator-overview' });
		}
	}

	onChooseSuggestion(result: SearchResult): void {
		this.chosen = result;
		this.finish();
	}

	onClose(): void {
		super.onClose();
		// Obsidian calls onClose before onChooseSuggestion, so wait a tick
		// before deciding the user skipped.
		window.setTimeout(() => this.finish(), 0);
	}

	private finish(): void {
		this.resolve?.(this.chosen);
		this.resolve = null;
	}
}
