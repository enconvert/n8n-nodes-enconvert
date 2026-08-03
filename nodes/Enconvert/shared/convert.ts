import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	attachOutputFile,
	fetchText,
	outputFileName,
	stripExtension,
	type ResolvedInputFile,
} from './binary';
import { apiRequestMultipart, newJobId } from './transport';
import type { UploadRoute } from './routes.generated';

export type ResponseFormat = 'binary' | 'text' | 'url';

export interface ConversionRequest {
	itemIndex: number;
	route: UploadRoute;
	file: ResolvedInputFile;
	/** Extra multipart fields: pdf_options, width, height, target_size_kb. */
	extraFields?: IDataObject;
	/** Extension of the produced file, without the dot. */
	outputExtension: string;
	outputFileNameOverride?: string;
	responseFormat: ResponseFormat;
	outputBinaryPropertyName: string;
	/** Notes surfaced on the output item, e.g. dropped PDF geometry. */
	warnings?: string[];
}

interface ConversionResponse {
	presigned_url?: string;
	object_key?: string;
	filename?: string;
	file_size?: number;
	conversion_time_seconds?: number;
	job_id?: string;
}

/**
 * Upload a file to a /v1/convert/* endpoint and shape the result.
 *
 * Every file endpoint answers with JSON carrying a presigned URL rather than
 * the bytes themselves (the gateway hardcodes needs_polling), so producing an
 * n8n binary always takes a second, unauthenticated fetch of that URL.
 */
export async function runConversion(
	this: IExecuteFunctions,
	request: ConversionRequest,
): Promise<INodeExecutionData> {
	const { itemIndex, route, file, outputExtension, responseFormat, outputBinaryPropertyName } =
		request;

	const jobId = newJobId();
	let fileName = outputFileName(file.stem, outputExtension, request.outputFileNameOverride);

	const fields: IDataObject = {
		direct_download: 'false',
		job_id: jobId,
		output_filename: fileName,
		...(request.extraFields ?? {}),
	};

	const response = (await apiRequestMultipart.call(
		this,
		route.endpoint,
		[file],
		fields,
		itemIndex,
	)) as ConversionResponse & IDataObject;

	if (!response.presigned_url) {
		throw new NodeOperationError(this.getNode(), 'EnConvert did not return a converted file', {
			itemIndex,
			description: `The conversion reported success but no download link came back. Job ID ${jobId}.`,
		});
	}

	// A multi-page PDF sent to pdf-to-jpeg comes back as a ZIP of one JPEG per
	// page, and the gateway switches the extension on us. Follow it, otherwise
	// the item would carry a .jpeg name wrapped around ZIP bytes.
	const warnings = [...(request.warnings ?? [])];
	if (response.filename?.toLowerCase().endsWith('.zip') && outputExtension !== 'zip') {
		fileName = outputFileName(stripExtension(fileName), 'zip');
		warnings.push(
			'The PDF had more than one page, so the result is a ZIP containing one image per page',
		);
	}

	// EnConvert appends a timestamp to the stored name so object keys stay
	// unique. That is a storage detail: an n8n user who asked for "invoice.pdf"
	// wants "invoice.pdf" on the item, not "invoice_20260101_120000123.pdf".
	// The stored name is kept alongside so the object is still traceable.
	const json: IDataObject = {
		fileName,
		fileSize: response.file_size,
		conversionTimeSeconds: response.conversion_time_seconds,
		jobId: response.job_id ?? jobId,
		objectKey: response.object_key,
		storedFileName: response.filename,
		sourceFileName: file.fileName,
		endpoint: route.name,
	};

	if (warnings.length > 0) json.warnings = warnings;

	if (responseFormat === 'url') {
		json.downloadUrl = response.presigned_url;
		json.downloadUrlExpiresInSeconds = 900;
		return { json, pairedItem: { item: itemIndex } };
	}

	if (responseFormat === 'text') {
		const text = await fetchText.call(this, response.presigned_url, itemIndex);
		if (outputExtension === 'json') {
			json.data = safeParseJson(text);
		} else {
			json.text = text;
		}
		return { json, pairedItem: { item: itemIndex } };
	}

	const binary = await attachOutputFile.call(
		this,
		response.presigned_url,
		String(json.fileName),
		itemIndex,
		outputBinaryPropertyName,
	);

	return { json, binary, pairedItem: { item: itemIndex } };
}

function safeParseJson(text: string): IDataObject | IDataObject[] | string {
	try {
		return JSON.parse(text) as IDataObject | IDataObject[];
	} catch {
		return text;
	}
}

/**
 * Translate the PDF Options collection into the gateway's pdf_options payload.
 *
 * Office inputs (doc, xlsx, pages, ...) reject explicit page geometry with a
 * 400 and honour only grayscale, so those fields are dropped here rather than
 * letting the conversion fail. Anything dropped is reported back to the user.
 */
export function buildPdfOptions(
	pdfOptions: IDataObject,
	capability: UploadRoute['pdfOptions'],
	warnings: string[],
): string | undefined {
	if (capability === null) return undefined;
	if (Object.keys(pdfOptions).length === 0) return undefined;

	const grayscale = pdfOptions.grayscale === true;

	if (capability === 'grayscale-only') {
		const dropped = Object.keys(pdfOptions).filter((key) => key !== 'grayscale');
		if (dropped.length > 0) {
			warnings.push(
				`This file type is laid out by its own page settings, so ${dropped.join(', ')} were ignored. Only Grayscale applies.`,
			);
		}
		return grayscale ? JSON.stringify({ grayscale: true }) : undefined;
	}

	const payload: IDataObject = {};
	if (typeof pdfOptions.pageSize === 'string') payload.page_size = pdfOptions.pageSize;
	if (typeof pdfOptions.orientation === 'string') payload.orientation = pdfOptions.orientation;
	if (typeof pdfOptions.scale === 'number') payload.scale = pdfOptions.scale;
	if (grayscale) payload.grayscale = true;

	const margins: IDataObject = {};
	if (typeof pdfOptions.marginTop === 'number') margins.top = pdfOptions.marginTop;
	if (typeof pdfOptions.marginBottom === 'number') margins.bottom = pdfOptions.marginBottom;
	if (typeof pdfOptions.marginLeft === 'number') margins.left = pdfOptions.marginLeft;
	if (typeof pdfOptions.marginRight === 'number') margins.right = pdfOptions.marginRight;
	if (Object.keys(margins).length > 0) payload.margins = margins;

	if (typeof pdfOptions.header === 'string' && pdfOptions.header !== '') {
		payload.header = { content: pdfOptions.header };
	}
	if (typeof pdfOptions.footer === 'string' && pdfOptions.footer !== '') {
		payload.footer = { content: pdfOptions.footer };
	}

	return Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined;
}
