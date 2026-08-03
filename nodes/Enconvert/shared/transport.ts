import { randomUUID } from 'node:crypto';

import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

import { toNodeApiError } from './errors';

/**
 * `Buffer | Readable`, derived from n8n's own helper signature.
 * Importing `stream` directly is banned for community nodes
 * (lint: no-restricted-imports), so the type is borrowed instead.
 */
export type BinarySource = Parameters<IExecuteFunctions['helpers']['prepareBinaryData']>[0];

export const CREDENTIAL_NAME = 'enconvertApi';
const DEFAULT_BASE_URL = 'https://api.enconvert.com';

/** Presigned download URLs stay valid for 900s (gateway: utils/storage.py). */
export const PRESIGNED_URL_TTL_SECONDS = 900;

export type RequestContext = IExecuteFunctions | ILoadOptionsFunctions;

export async function getBaseUrl(this: RequestContext): Promise<string> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = (credentials.baseUrl as string) || DEFAULT_BASE_URL;
	return baseUrl.replace(/\/+$/, '');
}

/**
 * A JSON request against the EnConvert API, authenticated with the credential.
 * Uses httpRequestWithAuthentication so the X-API-Key header is applied by n8n
 * rather than being assembled here (lint: no-http-request-with-manual-auth).
 */
export async function apiRequest(
	this: RequestContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
	itemIndex = 0,
): Promise<IDataObject> {
	const baseUrl = await getBaseUrl.call(this);

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		headers: { Accept: 'application/json' },
		json: true,
	};
	if (body !== undefined) options.body = body;
	if (qs !== undefined) options.qs = qs;

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			options,
		)) as IDataObject;
	} catch (error) {
		throw toNodeApiError(this.getNode(), error, itemIndex);
	}
}

/**
 * Same as apiRequest but returns status code alongside the body. Needed by
 * POST /v2/perceive/batch, which answers 200 (finished inline) or 202 (queued)
 * from the same call — the body alone does not tell you which.
 */
export async function apiRequestWithStatus(
	this: RequestContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
	itemIndex = 0,
): Promise<{ statusCode: number; body: IDataObject }> {
	const baseUrl = await getBaseUrl.call(this);

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		headers: { Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
	};
	if (body !== undefined) options.body = body;
	if (qs !== undefined) options.qs = qs;

	try {
		const response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			options,
		)) as { statusCode: number; body: IDataObject };
		return { statusCode: response.statusCode, body: response.body };
	} catch (error) {
		throw toNodeApiError(this.getNode(), error, itemIndex);
	}
}

export interface UploadPart {
	/** File bytes, or a stream when n8n has offloaded the binary to disk/S3. */
	content: BinarySource;
	fileName: string;
	mimeType: string;
}

/**
 * Multipart upload to a /v1/convert/* or /v2/ingest/files endpoint.
 *
 * Built with the Node-native FormData + Blob rather than the `form-data`
 * package: community nodes must ship zero runtime dependencies. n8n sets
 * `content-type: multipart/form-data` automatically for a FormData body, so no
 * Content-Type header is set here — an explicit one would win and break the
 * multipart boundary.
 */
export async function apiRequestMultipart(
	this: IExecuteFunctions,
	path: string,
	files: UploadPart[],
	fields: IDataObject,
	itemIndex: number,
	fileFieldName = 'file',
): Promise<IDataObject> {
	const baseUrl = await getBaseUrl.call(this);
	const form = new FormData();

	for (const file of files) {
		const buffer = Buffer.isBuffer(file.content)
			? file.content
			: await this.helpers.binaryToBuffer(file.content);
		form.append(
			fileFieldName,
			new Blob([new Uint8Array(buffer)], { type: file.mimeType }),
			file.fileName,
		);
	}

	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null) continue;
		form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
	}

	const options: IHttpRequestOptions = {
		method: 'POST',
		url: `${baseUrl}${path}`,
		headers: { Accept: 'application/json' },
		body: form,
		json: false,
		returnFullResponse: true,
	};

	try {
		const response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			options,
		)) as { body: unknown };
		return parseJsonBody(response.body);
	} catch (error) {
		throw toNodeApiError(this.getNode(), error, itemIndex);
	}
}

function parseJsonBody(body: unknown): IDataObject {
	if (typeof body === 'string') {
		try {
			return JSON.parse(body) as IDataObject;
		} catch {
			return { raw: body };
		}
	}
	return (body ?? {}) as IDataObject;
}

export interface DownloadedArtifact {
	stream: BinarySource;
	contentType?: string;
	fileName?: string;
}

/**
 * Fetch a presigned result URL.
 *
 * Deliberately uses plain httpRequest, NOT httpRequestWithAuthentication:
 * presigned URLs carry their own signature and the object store rejects the
 * request if an X-API-Key header is attached.
 */
export async function downloadArtifact(
	this: IExecuteFunctions,
	url: string,
	itemIndex: number,
): Promise<DownloadedArtifact> {
	try {
		const response = (await this.helpers.httpRequest({
			method: 'GET',
			url,
			encoding: 'stream',
			returnFullResponse: true,
			json: false,
		})) as { body: BinarySource; headers: Record<string, string | undefined> };

		return {
			stream: response.body,
			contentType: response.headers?.['content-type'],
			fileName: fileNameFromHeaders(response.headers, url),
		};
	} catch (error) {
		throw toNodeApiError(this.getNode(), error, itemIndex);
	}
}

/** Fetch a presigned URL and decode it as text (markdown, JSON artifacts). */
export async function downloadArtifactAsText(
	this: IExecuteFunctions,
	url: string,
	itemIndex: number,
): Promise<string> {
	const artifact = await downloadArtifact.call(this, url, itemIndex);
	return await this.helpers.binaryToString(artifact.stream);
}

function fileNameFromHeaders(
	headers: Record<string, string | undefined> | undefined,
	url: string,
): string | undefined {
	const disposition = headers?.['content-disposition'];
	const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
	if (match?.[1]) return decodeURIComponent(match[1]);

	const pathname = url.split('?')[0].split('/').pop();
	return pathname && pathname.includes('.') ? decodeURIComponent(pathname) : undefined;
}

/**
 * Client-generated job id, sent with every conversion so the result stays
 * retrievable via GET /v1/convert/status/{id} if the response is lost.
 * Mirrors the SDK's newJobId().
 */
export function newJobId(): string {
	return randomUUID().replace(/-/g, '');
}
