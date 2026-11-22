import { requestUrl } from 'obsidian';
import { HttpError, HttpGetJson, HttpRequestJson, Sleep } from '../api/types';

/**
 * `requestUrl` is Obsidian's HTTP call. Unlike `fetch` it is not subject to
 * CORS, and it can set headers such as User-Agent.
 */
export const requestJson: HttpRequestJson = async ({ timeoutMs, ...request }) => {
	let response;
	try {
		const pending = requestUrl({ ...request, throw: false });
		response = timeoutMs === undefined ? await pending : await withTimeout(pending, timeoutMs);
	} catch (err) {
		throw new HttpError(null, `Network error: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (response.status >= 400) {
		throw new HttpError(response.status, `Request failed with status ${response.status}`);
	}
	try {
		return response.json as unknown;
	} catch {
		throw new HttpError(response.status, 'Response was not valid JSON');
	}
};

/** requestUrl has no timeout option, so race it against a timer. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new Error(`Timed out after ${ms / 1000} s`)), ms);
		promise.then(
			(value) => {
				window.clearTimeout(timer);
				resolve(value);
			},
			(err: unknown) => {
				window.clearTimeout(timer);
				reject(err instanceof Error ? err : new Error(String(err)));
			},
		);
	});
}

export const getJson: HttpGetJson = (url) => requestJson({ url });

export async function getBytes(url: string): Promise<ArrayBuffer> {
	const response = await requestUrl({ url });
	return response.arrayBuffer;
}

export const sleep: Sleep = (ms) =>
	new Promise((resolve) => window.setTimeout(resolve, ms));
