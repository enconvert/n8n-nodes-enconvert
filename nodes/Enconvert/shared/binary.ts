import type { IBinaryData, IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	downloadArtifact,
	downloadArtifactAsText,
	type BinarySource,
	type UploadPart,
} from './transport';

const BINARY_ENCODING = 'base64';

export interface ResolvedInputFile extends UploadPart {
	/** Lowercase extension without the dot, e.g. "docx". Empty when unknown. */
	extension: string;
	/** Filename with the extension stripped, used to name the output. */
	stem: string;
}

/**
 * Read the file to convert off the current input item.
 *
 * assertBinaryData is called first on purpose: it raises n8n's own actionable
 * copy ("Make sure that the previous node outputs a binary file") instead of
 * the TypeError getBinaryDataBuffer would throw on a missing field.
 *
 * When n8n runs with N8N_DEFAULT_BINARY_DATA_MODE=filesystem or s3 the payload
 * lives outside the item and only `id` is set — that case is streamed rather
 * than buffered, so a 150 MB upload does not sit in memory.
 */
export async function readInputFile(
	this: IExecuteFunctions,
	itemIndex: number,
	binaryPropertyName: string,
	extensionOverride?: string,
): Promise<ResolvedInputFile> {
	const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);

	let content: BinarySource;
	if (binaryData.id) {
		content = await this.helpers.getBinaryStream(binaryData.id);
	} else {
		content = Buffer.from(binaryData.data, BINARY_ENCODING);
	}

	const fileName = binaryData.fileName ?? 'file';
	const extension = (extensionOverride ?? detectExtension(binaryData))
		.toLowerCase()
		.replace(/^\./, '');

	if (!extension) {
		throw new NodeOperationError(
			this.getNode(),
			`Could not tell what kind of file is in "${binaryPropertyName}"`,
			{
				itemIndex,
				description:
					'The incoming file has no extension in its name and no recognisable type. Set Input File Format in Options to say what it is.',
			},
		);
	}

	return {
		content,
		fileName,
		mimeType: binaryData.mimeType || 'application/octet-stream',
		extension,
		stem: stripExtension(fileName),
	};
}

function detectExtension(binaryData: IBinaryData): string {
	if (binaryData.fileExtension) return binaryData.fileExtension;

	const fromName = binaryData.fileName?.includes('.')
		? binaryData.fileName.split('.').pop()
		: undefined;
	if (fromName) return fromName;

	return MIME_TO_EXTENSION[binaryData.mimeType?.split(';')[0].trim() ?? ''] ?? '';
}

/** Only the types EnConvert accepts; anything else falls back to the filename. */
const MIME_TO_EXTENSION: Record<string, string> = {
	'application/json': 'json',
	'application/msword': 'doc',
	'application/pdf': 'pdf',
	'application/rtf': 'rtf',
	'application/toml': 'toml',
	'application/vnd.apple.numbers': 'numbers',
	'application/vnd.apple.pages': 'pages',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.ms-powerpoint': 'ppt',
	'application/vnd.oasis.opendocument.presentation': 'odp',
	'application/vnd.oasis.opendocument.spreadsheet': 'ods',
	'application/vnd.oasis.opendocument.spreadsheet-template': 'ots',
	'application/vnd.oasis.opendocument.text': 'odt',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/x-yaml': 'yaml',
	'application/xhtml+xml': 'xhtml',
	'application/xml': 'xml',
	'application/epub+zip': 'epub',
	'image/bmp': 'bmp',
	'image/gif': 'gif',
	'image/heic': 'heic',
	'image/heif': 'heif',
	'image/jpeg': 'jpeg',
	'image/png': 'png',
	'image/svg+xml': 'svg',
	'image/tiff': 'tiff',
	'image/webp': 'webp',
	'text/csv': 'csv',
	'text/html': 'html',
	'text/markdown': 'md',
	'text/plain': 'txt',
	'text/xml': 'xml',
	'text/yaml': 'yaml',
};

export function stripExtension(fileName: string): string {
	const lastDot = fileName.lastIndexOf('.');
	return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

/**
 * Download a converted result and attach it to the output item as binary.
 *
 * The filename is passed as the SECOND argument on purpose: prepareBinaryData
 * sets fileName only from that path, and called with one argument it leaves
 * fileName undefined and falls back to sniffing the mime type as text/plain.
 */
export async function attachOutputFile(
	this: IExecuteFunctions,
	url: string,
	fileName: string,
	itemIndex: number,
	binaryPropertyName: string,
	fallbackMimeType?: string,
): Promise<{ [key: string]: IBinaryData }> {
	const artifact = await downloadArtifact.call(this, url, itemIndex);
	const mimeType = artifact.contentType?.split(';')[0].trim() || fallbackMimeType;

	const binary = await this.helpers.prepareBinaryData(artifact.stream, fileName, mimeType);
	return { [binaryPropertyName]: binary };
}

/** Download a text artifact (markdown, HTML, JSON) and return it as a string. */
export async function fetchText(
	this: IExecuteFunctions,
	url: string,
	itemIndex: number,
): Promise<string> {
	return await downloadArtifactAsText.call(this, url, itemIndex);
}

/** Build the output filename: user override, else input stem + new extension. */
export function outputFileName(stem: string, extension: string, override?: string): string {
	const cleanExtension = extension.replace(/^\./, '');
	if (override) {
		return override.toLowerCase().endsWith(`.${cleanExtension}`)
			? override
			: `${stripExtension(override)}.${cleanExtension}`;
	}
	return `${stem}.${cleanExtension}`;
}

export function toExecutionData(
	json: IDataObject,
	itemIndex: number,
	binary?: { [key: string]: IBinaryData },
): INodeExecutionData {
	const item: INodeExecutionData = { json, pairedItem: { item: itemIndex } };
	if (binary) item.binary = binary;
	return item;
}
