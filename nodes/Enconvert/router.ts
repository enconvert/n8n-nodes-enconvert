import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { executeConvertData } from './resources/file/convertData';
import { executeSplitIntoChunks } from './resources/file/splitIntoChunks';
import { executeToMarkdown } from './resources/file/toMarkdown';
import { executeToPdf } from './resources/file/toPdf';
import { executeCompress } from './resources/image/compress';
import { executeConvertFormat } from './resources/image/convertFormat';
import {
	executeJobCancel,
	executeJobGet,
	executeJobGetAll,
	executeJobRetryWebhook,
} from './resources/job';
import { executeSearch } from './resources/search';
import { executeExtract } from './resources/webPage/extract';
import { executeScrape } from './resources/webPage/scrape';
import { executeScrapeMany } from './resources/webPage/scrapeMany';
import { executeCrawl } from './resources/website/crawl';
import { executeMap } from './resources/website/map';

export interface OperationHandler {
	/** Runs once per input item. */
	item?: (
		this: IExecuteFunctions,
		itemIndex: number,
	) => Promise<INodeExecutionData | INodeExecutionData[]>;
	/** Runs once for the whole batch, for operations that submit one job. */
	batch?: (this: IExecuteFunctions) => Promise<INodeExecutionData[]>;
}

const handlers: Record<string, Record<string, OperationHandler>> = {
	file: {
		convertData: { item: executeConvertData },
		splitIntoChunks: { batch: executeSplitIntoChunks },
		toMarkdown: { item: executeToMarkdown },
		toPdf: { item: executeToPdf },
	},
	image: {
		compress: { item: executeCompress },
		convertFormat: { item: executeConvertFormat },
	},
	job: {
		cancel: { item: executeJobCancel },
		get: { item: executeJobGet },
		getAll: { item: executeJobGetAll },
		retryWebhook: { item: executeJobRetryWebhook },
	},
	search: {
		search: { item: executeSearch },
	},
	webPage: {
		extract: { item: executeExtract },
		scrape: { item: executeScrape },
		scrapeMany: { item: executeScrapeMany },
	},
	website: {
		crawl: { item: executeCrawl },
		map: { item: executeMap },
	},
};

/** `resource:operation` keys that consume the whole input batch in one call. */
export const BATCH_OPERATIONS = new Set(['file:splitIntoChunks']);

export function route(resource: string, operation: string): OperationHandler | undefined {
	return handlers[resource]?.[operation];
}
