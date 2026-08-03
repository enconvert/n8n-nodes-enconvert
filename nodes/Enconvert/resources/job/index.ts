import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { apiRequest } from '../../shared/transport';

const showOnlyForJob = { resource: ['job'] };
const showForSingleJob = {
	resource: ['job'],
	operation: ['get', 'cancel', 'retryWebhook'],
};

type JobKind = 'perceive' | 'perceiveBatch' | 'ingest' | 'conversion';

export const jobDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForJob },
		default: 'get',
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				action: 'Cancel job',
				description: 'Stop a running crawl or multi-page scrape',
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get job',
				description: 'Look up any EnConvert job by its ID and collect the result',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many jobs',
				description: 'List recent crawl jobs',
			},
			{
				name: 'Retry Webhook',
				value: 'retryWebhook',
				action: 'Retry job webhook',
				description: 'Send the completion webhook for a finished crawl again',
			},
		],
	},
	{
		displayName: 'Job ID',
		name: 'jobId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. ing_3f9c1a...',
		description:
			'ID returned by an earlier run. The right endpoint is picked from the prefix, so scrape, multi-page scrape, crawl and conversion IDs all work here.',
		displayOptions: { show: showForSingleJob },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { ...showOnlyForJob, operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 100 },
		description: 'Max number of results to return',
		displayOptions: { show: { ...showOnlyForJob, operation: ['getAll'], returnAll: [false] } },
	},
];

/** EnConvert prefixes every job ID, so one operation can serve all four kinds. */
function classify(jobId: string): JobKind {
	if (jobId.startsWith('per_')) return 'perceive';
	if (jobId.startsWith('batch_')) return 'perceiveBatch';
	if (jobId.startsWith('ing_')) return 'ingest';
	return 'conversion';
}

export async function executeJobGet(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const jobId = (this.getNodeParameter('jobId', itemIndex) as string).trim();
	const encoded = encodeURIComponent(jobId);

	const path = {
		perceive: `/v2/perceive/${encoded}`,
		perceiveBatch: `/v2/perceive/batch/${encoded}`,
		ingest: `/v2/ingest/${encoded}`,
		conversion: `/v1/convert/status/${encoded}`,
	}[classify(jobId)];

	const response = await apiRequest.call(this, 'GET', path, undefined, undefined, itemIndex);
	return { json: response, pairedItem: { item: itemIndex } };
}

export async function executeJobGetAll(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = returnAll ? 100 : (this.getNodeParameter('limit', itemIndex, 50) as number);

	const collected: IDataObject[] = [];
	let skip = 0;

	for (;;) {
		const pageSize = returnAll ? 100 : Math.min(100, limit - collected.length);
		const response = (await apiRequest.call(
			this,
			'GET',
			'/v2/ingest',
			undefined,
			{ skip, limit: pageSize },
			itemIndex,
		)) as IDataObject;

		const jobs = (response.jobs as IDataObject[] | undefined) ?? [];
		collected.push(...jobs);

		if (!returnAll && collected.length >= limit) break;
		if (response.has_more !== true || jobs.length === 0) break;
		skip += jobs.length;
	}

	const sliced = returnAll ? collected : collected.slice(0, limit);
	return sliced.map((job) => ({ json: job, pairedItem: { item: itemIndex } }));
}

export async function executeJobCancel(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const jobId = (this.getNodeParameter('jobId', itemIndex) as string).trim();
	const encoded = encodeURIComponent(jobId);
	const kind = classify(jobId);

	if (kind !== 'ingest' && kind !== 'perceiveBatch') {
		throw new NodeOperationError(this.getNode(), `Job "${jobId}" cannot be cancelled`, {
			itemIndex,
			description:
				'Only crawl jobs (ing_...) and multi-page scrapes (batch_...) can be stopped once started.',
		});
	}

	const path = kind === 'ingest' ? `/v2/ingest/${encoded}` : `/v2/perceive/batch/${encoded}`;

	const response = await apiRequest.call(this, 'DELETE', path, undefined, undefined, itemIndex);
	return { json: response, pairedItem: { item: itemIndex } };
}

export async function executeJobRetryWebhook(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const jobId = (this.getNodeParameter('jobId', itemIndex) as string).trim();

	if (classify(jobId) !== 'ingest') {
		throw new NodeOperationError(this.getNode(), `Job "${jobId}" has no webhook to resend`, {
			itemIndex,
			description: 'Only crawl jobs (ing_...) send a completion webhook.',
		});
	}

	const response = await apiRequest.call(
		this,
		'POST',
		`/v2/ingest/${encodeURIComponent(jobId)}/retry-webhook`,
		{},
		undefined,
		itemIndex,
	);
	return { json: response, pairedItem: { item: itemIndex } };
}
