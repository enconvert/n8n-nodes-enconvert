import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

import { pdfOptionsCollection } from '../../shared/descriptions';
import {
	buildPerceiveOptions,
	outputsField,
	perceiveOptionFields,
	perceiveToItem,
	type PerceiveResult,
} from '../../shared/perceive';
import { apiRequest } from '../../shared/transport';

const showOnlyForScrape = { resource: ['webPage'], operation: ['scrape'] };

export const scrapeFields: INodeProperties[] = [
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/pricing',
		description: 'Address of the page to render',
		displayOptions: { show: showOnlyForScrape },
	},
	{ ...outputsField, displayOptions: { show: showOnlyForScrape } },
	{
		...pdfOptionsCollection,
		description: 'Page layout to use when PDF is one of the outputs',
		displayOptions: { show: { ...showOnlyForScrape, outputs: ['pdf'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForScrape },
		options: [
			{
				displayName: 'Download Artifacts',
				name: 'downloadArtifacts',
				type: 'boolean',
				default: true,
				description:
					'Whether to bring the results into the item. Turn off to receive download links instead, which is faster for large pages but the links expire after 15 minutes.',
			},
			...perceiveOptionFields,
		],
	},
];

export async function executeScrape(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const url = this.getNodeParameter('url', itemIndex) as string;
	const outputs = this.getNodeParameter('outputs', itemIndex, ['markdown']) as string[];
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const downloadArtifacts = (options.downloadArtifacts as boolean | undefined) ?? true;

	const body: IDataObject = {
		url,
		outputs: outputs.length > 0 ? outputs : ['markdown'],
		...buildPerceiveOptions(options),
	};

	if (outputs.includes('pdf')) {
		const pdfOptions = this.getNodeParameter('pdfOptions', itemIndex, {}) as IDataObject;
		const mapped = mapPdfOptions(pdfOptions);
		if (mapped) body.pdf_options = mapped;
	}

	const result = (await apiRequest.call(
		this,
		'POST',
		'/v2/perceive',
		body,
		undefined,
		itemIndex,
	)) as PerceiveResult;

	const item = await perceiveToItem.call(this, result, itemIndex, downloadArtifacts);
	return { ...item, pairedItem: { item: itemIndex } };
}

/** The v2 endpoints take pdf_options as a nested object, not a JSON string. */
export function mapPdfOptions(pdfOptions: IDataObject): IDataObject | undefined {
	if (Object.keys(pdfOptions).length === 0) return undefined;

	const payload: IDataObject = {};
	if (typeof pdfOptions.pageSize === 'string') payload.page_size = pdfOptions.pageSize;
	if (typeof pdfOptions.orientation === 'string') payload.orientation = pdfOptions.orientation;
	if (typeof pdfOptions.scale === 'number') payload.scale = pdfOptions.scale;
	if (pdfOptions.grayscale === true) payload.grayscale = true;

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

	return Object.keys(payload).length > 0 ? payload : undefined;
}
