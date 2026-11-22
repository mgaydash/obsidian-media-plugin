import { requestUrl } from 'obsidian';
import type { HttpGetJson } from '../api/types';

/**
 * `requestUrl` is Obsidian's HTTP call. Unlike `fetch` it is not subject to
 * CORS, and it throws on any 4xx/5xx response.
 */
export const getJson: HttpGetJson = async (url) => {
	const response = await requestUrl({ url });
	return response.json as unknown;
};

export async function getBytes(url: string): Promise<ArrayBuffer> {
	const response = await requestUrl({ url });
	return response.arrayBuffer;
}
