import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { attachOutputFile } from '../../shared/binary';
import { pdfOptionsCollection, waitOptionFields } from '../../shared/descriptions';
import {
	buildPerceiveOptions,
	outputsField,
	parseUrlList,
	perceiveOptionFields,
	perceiveToItem,
	type PerceiveResult,
} from '../../shared/perceive';
import { readWaitOptions, waitForJob } from '../../shared/poll';
import { apiRequest, apiRequestWithStatus } from '../../shared/transport';
import { mapPdfOptions } from './scrape';

const showOnlyForScrapeMany = { resource: ['webPage'], operation: ['scrapeMany'] };

interface BatchResult extends IDataObject {
	job_id?: string;
	status?: string;
	output_mode?: string;
	total?: number;
	completed?: number;
	failed?: number;
	pending?: number;
	zip?: { url?: string };
	items?: PerceiveResult[];
	warnings?: string[];
}

export const scrapeManyFields: INodeProperties[] = [
	{
		displayName: 'URLs',
		name: 'urls',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/a, https://example.com/b',
		description:
			'Addresses to render, one per line or separated by commas. An expression returning an array also works, so you can feed this straight from Website > Map.',
		typeOptions: { rows: 3 },
		displayOptions: { show: showOnlyForScrapeMany },
	},
	{ ...outputsField, displayOptions: { show: showOnlyForScrapeMany } },
	{
		displayName: 'Output Mode',
		name: 'outputMode',
		type: 'options',
		default: 'manifest',
		description: 'How EnConvert should hand back the rendered pages',
		displayOptions: { show: showOnlyForScrapeMany },
		options: [
			{
				name: 'One Item per Page',
				value: 'manifest',
				description: 'Each page becomes its own item, like Scrape does',
			},
			{
				name: 'Single ZIP File',
				value: 'zip',
				description: 'All results in one archive. Use this to file away a set of pages as PDFs.',
			},
		],
	},
	{
		...pdfOptionsCollection,
		description: 'Page layout to use when PDF is one of the outputs',
		displayOptions: { show: { ...showOnlyForScrapeMany, outputs: ['pdf'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForScrapeMany },
		options: [
			{
				displayName: 'Download Artifacts',
				name: 'downloadArtifacts',
				type: 'boolean',
				default: true,
				description:
					'Whether to bring the results into each item. Turn off to receive download links instead.',
			},
			...perceiveOptionFields,
			...waitOptionFields,
		],
	},
];

export async function executeScrapeMany(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const urls = parseUrlList(this.getNodeParameter('urls', itemIndex));
	if (urls.length === 0) {
		throw new NodeOperationError(this.getNode(), 'No URLs were given', {
			itemIndex,
			description: 'Add at least one address to URLs, one per line or separated by commas.',
		});
	}

	const outputs = this.getNodeParameter('outputs', itemIndex, ['markdown']) as string[];
	const outputMode = this.getNodeParameter('outputMode', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const downloadArtifacts = (options.downloadArtifacts as boolean | undefined) ?? true;
	const wait = readWaitOptions.call(this, itemIndex);

	const perceiveOptions: IDataObject = {
		outputs: outputs.length > 0 ? outputs : ['markdown'],
		...buildPerceiveOptions(options),
	};

	if (outputs.includes('pdf')) {
		const mapped = mapPdfOptions(this.getNodeParameter('pdfOptions', itemIndex, {}) as IDataObject);
		if (mapped) perceiveOptions.pdf_options = mapped;
	}

	// This endpoint answers 200 when it finished inline (10 URLs or fewer) and
	// 202 when it queued the work, so the status code is the branch, not the body.
	const submitted = await apiRequestWithStatus.call(
		this,
		'POST',
		'/v2/perceive/batch',
		{ urls, options: perceiveOptions, output_mode: outputMode },
		undefined,
		itemIndex,
	);

	let batch = submitted.body as BatchResult;

	if (submitted.statusCode === 202 && batch.job_id) {
		if (!wait.waitForCompletion) {
			return [{ json: summariseBatch(batch), pairedItem: { item: itemIndex } }];
		}
		batch = (await waitForJob.call(
			this,
			batch.job_id,
			async (id) =>
				await apiRequest.call(
					this,
					'GET',
					`/v2/perceive/batch/${encodeURIComponent(id)}`,
					undefined,
					undefined,
					itemIndex,
				),
			wait,
			itemIndex,
		)) as BatchResult;
	}

	if (outputMode === 'zip') {
		const summary = summariseBatch(batch);
		if (!batch.zip?.url || !downloadArtifacts) {
			if (batch.zip?.url) summary.downloadUrl = batch.zip.url;
			return [{ json: summary, pairedItem: { item: itemIndex } }];
		}
		const binary = await attachOutputFile.call(
			this,
			batch.zip.url,
			`${batch.job_id ?? 'scrape'}.zip`,
			itemIndex,
			'data',
			'application/zip',
		);
		return [{ json: summary, binary, pairedItem: { item: itemIndex } }];
	}

	const results = batch.items ?? [];
	if (results.length === 0) {
		return [{ json: summariseBatch(batch), pairedItem: { item: itemIndex } }];
	}

	const output: INodeExecutionData[] = [];
	for (const result of results) {
		const item = await perceiveToItem.call(this, result, itemIndex, downloadArtifacts);
		output.push({ ...item, pairedItem: { item: itemIndex } });
	}
	return output;
}

function summariseBatch(batch: BatchResult): IDataObject {
	const summary: IDataObject = {
		jobId: batch.job_id,
		status: batch.status,
		outputMode: batch.output_mode,
		total: batch.total,
		completed: batch.completed,
		failed: batch.failed,
		pending: batch.pending,
	};
	if (Array.isArray(batch.warnings) && batch.warnings.length > 0) summary.warnings = batch.warnings;
	return summary;
}
