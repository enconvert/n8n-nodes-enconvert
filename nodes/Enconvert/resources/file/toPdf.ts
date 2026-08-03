import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

import { readInputFile } from '../../shared/binary';
import { buildPdfOptions, runConversion, type ResponseFormat } from '../../shared/convert';
import {
	inputBinaryField,
	outputBinaryField,
	pdfOptionsCollection,
	responseFormatBinaryDefault,
} from '../../shared/descriptions';
import { resolveRoute } from '../../shared/routes';

const showOnlyForToPdf = { resource: ['file'], operation: ['toPdf'] };

export const toPdfFields: INodeProperties[] = [
	{
		displayName:
			'Accepts Word, Excel, PowerPoint, OpenDocument, Pages, Numbers, HTML, Markdown, text, RTF, CSV, EPUB, PDF, SVG and images.',
		name: 'toPdfNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForToPdf },
	},
	{ ...inputBinaryField, displayOptions: { show: showOnlyForToPdf } },
	{ ...responseFormatBinaryDefault, displayOptions: { show: showOnlyForToPdf } },
	{
		...outputBinaryField,
		displayOptions: { show: { ...showOnlyForToPdf, responseFormat: ['binary'] } },
	},
	{
		...pdfOptionsCollection,
		description:
			'Page layout for the PDF. Word, Excel, PowerPoint, OpenDocument, Pages and Numbers files carry their own page setup, so only Grayscale applies to them.',
		displayOptions: { show: showOnlyForToPdf },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForToPdf },
		options: [
			{
				displayName: 'Input File Format',
				name: 'inputFormat',
				type: 'string',
				default: '',
				placeholder: 'e.g. docx',
				description:
					'Set this when the incoming file has no extension in its name, for example a download from an HTTP Request node',
			},
			{
				displayName: 'Output File Name',
				name: 'outputFileName',
				type: 'string',
				default: '',
				placeholder: 'e.g. invoice.pdf',
				description: 'Defaults to the input file name with a .pdf extension',
			},
		],
	},
];

export async function executeToPdf(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
	const responseFormat = this.getNodeParameter('responseFormat', itemIndex) as ResponseFormat;
	const outputBinaryPropertyName = this.getNodeParameter(
		'outputBinaryPropertyName',
		itemIndex,
		'data',
	) as string;
	const pdfOptions = this.getNodeParameter('pdfOptions', itemIndex, {}) as IDataObject;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const file = await readInputFile.call(
		this,
		itemIndex,
		binaryPropertyName,
		options.inputFormat as string | undefined,
	);
	const route = resolveRoute(this.getNode(), file.extension, 'pdf', itemIndex);

	const warnings: string[] = [];
	// anything-to-pdf honours geometry for html/markdown/text/epub/image/svg but
	// not for office or pdf inputs, even though the route is flagged "full".
	const capability =
		route.group === 'universal' && isOfficeLike(file.extension)
			? 'grayscale-only'
			: route.pdfOptions;
	const serialisedPdfOptions = buildPdfOptions(pdfOptions, capability, warnings);

	return await runConversion.call(this, {
		itemIndex,
		route,
		file,
		extraFields: serialisedPdfOptions ? { pdf_options: serialisedPdfOptions } : {},
		outputExtension: 'pdf',
		outputFileNameOverride: options.outputFileName as string | undefined,
		responseFormat,
		outputBinaryPropertyName,
		warnings,
	});
}

const OFFICE_LIKE = new Set([
	'doc',
	'docx',
	'xls',
	'xlsx',
	'ppt',
	'pptx',
	'odt',
	'ods',
	'odp',
	'ots',
	'pages',
	'numbers',
	'rtf',
	'csv',
	'pdf',
]);

function isOfficeLike(extension: string): boolean {
	return OFFICE_LIKE.has(extension);
}
