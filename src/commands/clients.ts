import { GoogleBooksClient } from '../api/googlebooks';
import { IgdbClient } from '../api/igdb';
import { MusicBrainzClient } from '../api/musicbrainz';
import { TmdbClient } from '../api/tmdb';
import type { MediaClient } from '../api/types';
import type { MediaType } from '../core/notes';
import type MediaNotesPlugin from '../main';
import { getJson, requestJson, sleep } from '../obsidian/http';

/**
 * Build the API client for a media type, reading its keys from the Keychain.
 * Returns a message instead when a key is missing.
 */
export function createClient(
	plugin: MediaNotesPlugin,
	mediaType: MediaType,
): MediaClient | string {
	const { settings } = plugin;
	switch (mediaType) {
		case 'movie':
		case 'tv': {
			const key = plugin.getSecret(settings.tmdbSecretId);
			if (!key) return 'Add your TMDB API key in the Media Notes settings first.';
			return new TmdbClient(key, mediaType, getJson);
		}
		case 'game': {
			const id = plugin.getSecret(settings.igdbClientIdSecretId);
			const secret = plugin.getSecret(settings.igdbClientSecretSecretId);
			if (!id || !secret) {
				return 'Add your Twitch client ID and secret in the Media Notes settings first.';
			}
			return new IgdbClient(id, secret, requestJson);
		}
		case 'album': {
			const userAgent = `MediaNotes/${plugin.manifest.version} ( https://github.com/mgaydash/obsidian-media-plugin )`;
			return new MusicBrainzClient(requestJson, userAgent, sleep);
		}
		case 'book': {
			const key = plugin.getSecret(settings.googleBooksSecretId);
			if (!key) return 'Add your Google Books API key in the Media Notes settings first.';
			return new GoogleBooksClient(key, requestJson, sleep);
		}
	}
}
