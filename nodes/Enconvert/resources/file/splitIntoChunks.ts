import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

import { readInputFile } from '../../shared/binary';
import { inputBinaryField, waitOptionFields } from '../../shared/descriptions';
import {
	chunkOptionFields,
	ingestOutputField,
	resolveIngestJob,
	type IngestOutputMode,
} from '../../shared/ingest';
import { readWaitOptions } from '../../shared/poll';
import { apiRequestMultipart } from '../../shared/transport';

const showOnlyForSplit = { resource: ['file'], operation: ['splitIntoChunks'] };

export const splitIntoChunksFields: INodeProperties[] = [
	{
		displayName:
			'Each input item contributes one file, up to 200 per run. Passages come back ready for a Default Data Loader and a vector store.',
		name: 'splitIntoChunksNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForSplit },
	},
	{ ...inputBinaryField, displayOptions: { show: showOnlyForSplit } },
	{ ...ingestOutputField, displayOptions: { show: showOnlyForSplit } },
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForSplit },
		options: [
			...chunkOptionFields,
			{
				displayName: 'Input File Format',
				name: 'inputFormat',
				type: 'string',
				default: '',
				placeholder: 'e.g. docx',
				description: 'Set this when the incoming file has no extension in its name',
			},
			...waitOptionFields,
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/webhook/enconvert',
				description:
					'EnConvert calls this address when the job finishes, signed with your webhook secret. Useful with Wait for Completion turned off.',
			},
		],
	},
];

/**
 * Uploads every input item's file in one job, so this runs once for the whole
 * batch rather than per item. Returns null for every item except the first.
 */
export async function executeSplitIntoChunks(
	this: IExecuteFunctions,
): Promise<INodeExecutionData[]> {
	const items = this.getInputData();
	const options = this.getNodeParameter('options', 0, {}) as IDataObject;
	const outputMode = this.getNodeParameter('ingestOutput', 0) as IngestOutputMode;
	const wait = readWaitOptions.call(this, 0);

	const files = [];
	for (let i = 0; i < items.length; i++) {
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
		files.push(
			await readInputFile.call(
				this,
				i,
				binaryPropertyName,
				options.inputFormat as string | undefined,
			),
		);
	}

	const fields: IDataObject = {};
	if (typeof options.chunkMaxWords === 'number') fields.max_words = String(options.chunkMaxWords);
	if (typeof options.chunkSentenceOverlap === 'number') {
		fields.sentence_overlap = String(options.chunkSentenceOverlap);
	}
	if (options.webhookUrl) fields.webhook_url = options.webhookUrl as string;

	const submitted = await apiRequestMultipart.call(
		this,
		'/v2/ingest/files',
		files,
		fields,
		0,
		'files',
	);

	return await resolveIngestJob.call(this, submitted, outputMode, wait, 0);
}
