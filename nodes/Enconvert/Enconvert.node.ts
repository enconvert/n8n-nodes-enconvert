import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { fileDescription } from './resources/file';
import { imageDescription } from './resources/image';
import { jobDescription } from './resources/job';
import { searchDescription } from './resources/search';
import { webPageDescription } from './resources/webPage';
import { websiteDescription } from './resources/website';
import { BATCH_OPERATIONS, route } from './router';
import { toNodeApiError } from './shared/errors';

export class Enconvert implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'EnConvert',
		name: 'enconvert',
		icon: {
			light: 'file:../../icons/enconvert.svg',
			dark: 'file:../../icons/enconvert.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Convert files, scrape web pages and crawl sites into AI-ready data',
		defaults: { name: 'EnConvert' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'enconvertApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'file',
				options: [
					{ name: 'File', value: 'file' },
					{ name: 'Image', value: 'image' },
					{ name: 'Job', value: 'job' },
					{ name: 'Search', value: 'search' },
					{ name: 'Web Page', value: 'webPage' },
					{ name: 'Website', value: 'website' },
				],
			},
			...fileDescription,
			...imageDescription,
			...webPageDescription,
			...websiteDescription,
			...searchDescription,
			...jobDescription,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const handler = route(resource, operation);

		if (!handler) {
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for ${resource}`,
			);
		}

		// A few operations submit every input item as one job (uploading many
		// files at once), so they run once for the whole batch.
		if (BATCH_OPERATIONS.has(`${resource}:${operation}`)) {
			try {
				return [await handler.batch!.call(this)];
			} catch (error) {
				if (this.continueOnFail()) {
					return [[{ json: { error: (error as Error).message }, pairedItem: { item: 0 } }]];
				}
				throw toNodeApiError(this.getNode(), error, 0);
			}
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const result = await handler.item!.call(this, i);
				returnData.push(...(Array.isArray(result) ? result : [result]));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw toNodeApiError(this.getNode(), error, i);
			}
		}

		return [returnData];
	}
}
