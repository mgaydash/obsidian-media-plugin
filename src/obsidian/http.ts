import { requestUrl } from 'obsidian';
import { HttpError, HttpGetJson, HttpRequestJson, Sleep } from '../api/types';

/**
 * `requestUrl` is Obsidian's HTTP call. Unlike `fetch` it is not subject to
 * CORS, and it can set headers such as User-Agent.
 */
export const requestJson: HttpRequestJson = async (request) => {
	let response;
	try {
		response = await requestUrl({ ...request, throw: false });
	} catch (err) {
		throw new HttpError(null, `Network error: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (response.status >= 400) {
		throw new HttpError(response.status, `Request failed with status ${response.status}`);
	}
	return response.json as unknown;
};

export const getJson: HttpGetJson = (url) => requestJson({ url });

export async function getBytes(url: string): Promise<ArrayBuffer> {
	const response = await requestUrl({ url });
	return response.arrayBuffer;
}

export const sleep: Sleep = (ms) =>
	new Promise((resolve) => window.setTimeout(resolve, ms));
