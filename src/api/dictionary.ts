/**
 * Word lookups, ported from the CLI's `lib/api/dictionary_client.py`.
 *
 * Two sources serve the same Wiktionary content under CC BY-SA:
 * - Primary: the Free Dictionary API (api.dictionaryapi.dev), a community
 *   proxy. Richer (pronunciation, examples, synonyms) but it hangs or fails
 *   often enough to matter.
 * - Fallback: Wikimedia's own definition endpoint. Reliable but thinner, and
 *   it cannot split homographs.
 *
 * After the primary fails once, the rest of the batch goes straight to the
 * fallback, so a long list does not wait out the timeout for every word.
 */
import { buildFrontmatter, COLLECTION_BY_MEDIA_TYPE, sanitizeFilename, wikilink } from '../core/notes';
import { HttpError, HttpRequestJson, MediaClient, SearchResult } from './types';

const PRIMARY_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const FALLBACK_URL = 'https://en.wiktionary.org/api/rest_v1/page/definition';
/** Wiktionary's text license since 2023 (Wikimedia Terms of Use, section 7). */
const WIKTIONARY_LICENSE = 'CC BY-SA 4.0';
const WIKTIONARY_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
/** The primary's usual failure is a hang, so it gets the shorter wait. */
export const PRIMARY_TIMEOUT_MS = 8000;
export const FALLBACK_TIMEOUT_MS = 15000;

export interface Definition {
	definition: string;
	example: string | null;
}

export interface Meaning {
	partOfSpeech: string;
	definitions: Definition[];
}

/** One dictionary entry (one etymology), in the CLI's normalized shape. */
export interface WordEntry {
	/** "word#index", so homographs get distinct ids. */
	id: string;
	word: string;
	phonetic: string | null;
	meanings: Meaning[];
	synonyms: string[];
	antonyms: string[];
	sourceUrls: string[];
	license: string;
	/** Link to the license text, which CC BY-SA asks each copy to include. */
	licenseUrl: string | null;
	source: 'dictionaryapi.dev' | 'wiktionary';
}

interface PrimaryDefinition {
	definition?: string;
	example?: string;
	synonyms?: unknown;
	antonyms?: unknown;
}

interface PrimaryEntry {
	word?: string;
	phonetic?: string;
	phonetics?: { text?: string }[];
	meanings?: {
		partOfSpeech?: string;
		definitions?: PrimaryDefinition[];
		synonyms?: unknown;
		antonyms?: unknown;
	}[];
	license?: { name?: string; url?: string };
	sourceUrls?: string[];
}

interface FallbackSection {
	partOfSpeech?: string;
	definitions?: { definition?: string; examples?: string[] }[];
}

function stripHtml(text: string): string {
	return text.replace(/<[^>]+>/g, '');
}

/** Append new, non-empty strings to `target`, keeping order. */
function collect(target: string[], values: unknown): void {
	if (!Array.isArray(values)) return;
	for (const raw of values) {
		const value = String(raw).trim();
		if (value && !target.includes(value)) target.push(value);
	}
}

/** Python's str.capitalize(): first letter upper, the rest lower. */
function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function normalizePrimary(word: string, index: number, entry: PrimaryEntry): WordEntry {
	const meanings: Meaning[] = [];
	const synonyms: string[] = [];
	const antonyms: string[] = [];

	for (const meaning of entry.meanings ?? []) {
		const definitions: Definition[] = [];
		for (const d of meaning.definitions ?? []) {
			const text = (d.definition ?? '').trim();
			if (!text) continue;
			definitions.push({ definition: text, example: (d.example ?? '').trim() || null });
			collect(synonyms, d.synonyms);
			collect(antonyms, d.antonyms);
		}
		collect(synonyms, meaning.synonyms);
		collect(antonyms, meaning.antonyms);
		if (definitions.length > 0) {
			meanings.push({ partOfSpeech: meaning.partOfSpeech ?? 'definition', definitions });
		}
	}

	const phonetic =
		(entry.phonetic ?? '').trim() ||
		(entry.phonetics ?? []).map((p) => (p.text ?? '').trim()).find(Boolean) ||
		null;

	return {
		id: `${word}#${index}`,
		word: entry.word || word,
		phonetic,
		meanings,
		synonyms,
		antonyms,
		sourceUrls: entry.sourceUrls ?? [],
		// The primary reports the license of the Wiktionary revision it copied.
		...(entry.license?.name
			? { license: entry.license.name, licenseUrl: entry.license.url || null }
			: { license: WIKTIONARY_LICENSE, licenseUrl: WIKTIONARY_LICENSE_URL }),
		source: 'dictionaryapi.dev',
	};
}

export function normalizeFallback(word: string, sections: FallbackSection[]): WordEntry {
	const meanings: Meaning[] = [];
	for (const section of sections) {
		const definitions: Definition[] = [];
		for (const d of section.definitions ?? []) {
			const text = stripHtml(d.definition ?? '').trim();
			if (!text) continue;
			const example = (d.examples ?? []).map((e) => stripHtml(e).trim()).find(Boolean) ?? null;
			definitions.push({ definition: text, example });
		}
		if (definitions.length > 0) {
			meanings.push({ partOfSpeech: section.partOfSpeech ?? 'definition', definitions });
		}
	}
	return {
		id: `${word}#0`,
		word,
		phonetic: null,
		meanings,
		synonyms: [],
		antonyms: [],
		sourceUrls: [`https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`],
		license: WIKTIONARY_LICENSE,
		licenseUrl: WIKTIONARY_LICENSE_URL,
		source: 'wiktionary',
	};
}

export class DictionaryClient implements MediaClient<WordEntry> {
	readonly mediaType = 'lookup' as const;
	/** Both sources return everything at once, so search() caches entries for getDetails(). */
	private readonly entries = new Map<string, WordEntry>();
	private primaryFailed = false;

	constructor(
		private readonly request: HttpRequestJson,
		private readonly userAgent: string,
	) {}

	/** Whether the primary source has failed during this batch. */
	get usingFallback(): boolean {
		return this.primaryFailed;
	}

	/**
	 * Look a word up, one entry per etymology. This is an exact lookup, not a
	 * search: an unknown word returns nothing rather than near misses.
	 */
	async search(title: string): Promise<SearchResult[]> {
		const word = title.trim();
		if (!word) return [];

		let entries: WordEntry[];
		if (this.primaryFailed) {
			entries = await this.fetchFallback(word);
		} else {
			try {
				entries = await this.fetchPrimary(word);
			} catch (err) {
				if (!(err instanceof HttpError)) throw err;
				this.primaryFailed = true;
				entries = await this.fetchFallback(word);
			}
		}

		for (const entry of entries) this.entries.set(entry.id, entry);
		return entries.map((entry) => {
			const parts = entry.meanings.map((m) => m.partOfSpeech).join('/') || 'entry';
			let preview = entry.meanings[0]?.definitions[0]?.definition ?? '';
			if (preview.length > 100) preview = `${preview.slice(0, 97)}...`;
			return {
				id: entry.id,
				title: entry.word,
				year: null,
				overview: preview ? `[${parts}] ${preview}` : `[${parts}]`,
				thumbnailUrl: null,
			};
		});
	}

	private headers(): Record<string, string> {
		return { 'User-Agent': this.userAgent, Accept: 'application/json' };
	}

	/** A 404 means the word is not in Wiktionary, which the fallback shares, so it is not a failure. */
	private async fetchPrimary(word: string): Promise<WordEntry[]> {
		let payload: unknown;
		try {
			payload = await this.request({
				url: `${PRIMARY_URL}/${encodeURIComponent(word)}`,
				headers: this.headers(),
				timeoutMs: PRIMARY_TIMEOUT_MS,
			});
		} catch (err) {
			if (err instanceof HttpError && err.status === 404) return [];
			throw err;
		}
		if (!Array.isArray(payload)) return [];
		return (payload as PrimaryEntry[]).map((entry, i) => normalizePrimary(word, i, entry));
	}

	private async fetchFallback(word: string): Promise<WordEntry[]> {
		let payload: unknown;
		try {
			payload = await this.request({
				url: `${FALLBACK_URL}/${encodeURIComponent(word)}`,
				headers: this.headers(),
				timeoutMs: FALLBACK_TIMEOUT_MS,
			});
		} catch (err) {
			if (err instanceof HttpError && err.status === 404) return [];
			const detail = err instanceof Error ? err.message : String(err);
			throw new Error(`Dictionary API error: ${detail}`);
		}
		const english =
			payload && typeof payload === 'object' && !Array.isArray(payload)
				? (payload as { en?: FallbackSection[] }).en
				: undefined;
		if (!english || english.length === 0) return [];
		return [normalizeFallback(word, english)];
	}

	async getDetails(id: string): Promise<WordEntry> {
		const cached = this.entries.get(id);
		if (cached) return cached;
		// Outside a search: look the word up again, then match the id.
		await this.search(id.split('#')[0] ?? id);
		const entry = this.entries.get(id);
		if (!entry) throw new Error(`No dictionary entry found for "${id}"`);
		return entry;
	}

	getTitleAndYear(entry: WordEntry): { title: string; year: string | null } {
		return { title: entry.word, year: null };
	}

	/** "Word.md": words have no year. */
	getFilename(entry: WordEntry): string {
		return `${sanitizeFilename(entry.word)}.md`;
	}

	formatNote(entry: WordEntry): string {
		// Part of speech is the facet tag. It is not a genre, so it skips the genre table.
		const tags: string[] = [];
		for (const m of entry.meanings) {
			const tag = m.partOfSpeech.toLowerCase().replace(/ /g, '-');
			if (tag && !tags.includes(tag)) tags.push(tag);
		}

		const sections: string[] = [];
		if (entry.phonetic) sections.push(`## Pronunciation\n${entry.phonetic}`);
		for (const m of entry.meanings) {
			const lines = [`## ${capitalize(m.partOfSpeech || 'Definition')}`];
			m.definitions.forEach((d, i) => {
				lines.push(`${i + 1}. ${d.definition}`);
				if (d.example) lines.push(`   - *${d.example}*`);
			});
			sections.push(lines.join('\n'));
		}
		if (entry.synonyms.length > 0) {
			sections.push(`## Synonyms\n${entry.synonyms.map(wikilink).join(', ')}`);
		}
		if (entry.antonyms.length > 0) {
			sections.push(`## Antonyms\n${entry.antonyms.map(wikilink).join(', ')}`);
		}
		// CC BY-SA requires attribution and a link to the license, and these
		// notes keep the text.
		const license = entry.licenseUrl ? `[${entry.license}](${entry.licenseUrl})` : entry.license;
		sections.push(`## Source\n${[...entry.sourceUrls, license].join('\n')}`);

		return `${buildFrontmatter(COLLECTION_BY_MEDIA_TYPE.lookup, tags)}\n\n${sections.join('\n\n')}\n`;
	}

	getPosterUrl(): null {
		return null;
	}
}
