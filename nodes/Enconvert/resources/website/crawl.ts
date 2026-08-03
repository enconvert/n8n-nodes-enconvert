import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

import { waitOptionFields } from '../../shared/descriptions';
import {
	chunkOptionFields,
	ingestOutputField,
	resolveIngestJob,
	type IngestOutputMode,
} from '../../shared/ingest';
import { parseUrlList } from '../../shared/perceive';
import { readWaitOptions } from '../../shared/poll';
import { apiRequest } from '../../shared/transport';
import { splitPatterns } from './map';

const showOnlyForCrawl = { resource: ['website'], operation: ['crawl'] };

export const crawlFields: INodeProperties[] = [
	{
		displayName:
			'Reads every page and splits it into overlapping passages that keep their heading path, ready to embed. Runs without cookies or sign-in.',
		name: 'crawlNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForCrawl },
	},
	{
		displayName: 'Mode',
		name: 'mode',
		type: 'options',
		default: 'crawl',
		description: 'How to decide which pages to read',
		displayOptions: { show: showOnlyForCrawl },
		options: [
			{ name: 'Crawl Links', value: 'crawl', description: 'Follow links from a starting address' },
			{ name: 'Sitemap', value: 'sitemap', description: 'Read every address in the site sitemap' },
			{ name: 'Specific URLs', value: 'urls', description: 'Read only the addresses you list' },
		],
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/docs',
		description: 'Address to start from',
		displayOptions: { show: { ...showOnlyForCrawl, mode: ['crawl', 'sitemap'] } },
	},
	{
		displayName: 'URLs',
		name: 'urls',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/a, https://example.com/b',
		description:
			'Addresses to read, one per line or separated by commas. An expression returning an array also works.',
		displayOptions: { show: { ...showOnlyForCrawl, mode: ['urls'] } },
	},
	{
		displayName: 'Max Pages',
		name: 'maxPages',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 1000 },
		description: 'How many pages to read at most',
		displayOptions: { show: { ...showOnlyForCrawl, mode: ['crawl', 'sitemap'] } },
	},
	{ ...ingestOutputField, displayOptions: { show: showOnlyForCrawl } },
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForCrawl },
		options: [
			...chunkOptionFields,
			{
				displayName: 'Exclude Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: 'e.g. /tag/, /author/',
				description: 'Skip addresses matching these regular expressions, up to 50',
			},
			{
				displayName: 'Include Patterns',
				name: 'includePatterns',
				type: 'string',
				default: '',
				placeholder: 'e.g. /docs/',
				description: 'Keep only addresses matching these regular expressions, up to 50',
			},
			{
				displayName: 'Max Depth',
				name: 'maxDepth',
				type: 'number',
				default: 2,
				typeOptions: { minValue: 1, maxValue: 5 },
				description: 'How many links deep to follow',
			},
			{
				displayName: 'Respect Robots.txt',
				name: 'respectRobots',
				type: 'boolean',
				default: false,
				description: 'Whether to skip pages the site asks crawlers not to visit',
			},
			{
				displayName: 'Same Domain Only',
				name: 'sameDomainOnly',
				type: 'boolean',
				default: true,
				description: 'Whether to ignore addresses that point at another domain',
			},
			...waitOptionFields,
			{
				displayName: 'Wait for Selector',
				name: 'waitFor',
				type: 'string',
				default: '',
				placeholder: 'e.g. main article',
				description: 'Hold each page render until this CSS selector appears',
			},
			{
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/webhook/enconvert',
				description:
					'EnConvert calls this address when the crawl finishes, signed with your webhook secret. Pair it with Wait for Completion turned off for long crawls.',
			},
		],
	},
];

export async function executeCrawl(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const mode = this.getNodeParameter('mode', itemIndex) as string;
	const outputMode = this.getNodeParameter('ingestOutput', itemIndex) as IngestOutputMode;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const wait = readWaitOptions.call(this, itemIndex);

	const body: IDataObject = { mode };

	if (mode === 'urls') {
		body.urls = parseUrlList(this.getNodeParameter('urls', itemIndex));
	} else {
		body.url = this.getNodeParameter('url', itemIndex) as string;
		body.max_pages = this.getNodeParameter('maxPages', itemIndex, 50) as number;
		if (typeof options.maxDepth === 'number') body.max_depth = options.maxDepth;
		if (options.sameDomainOnly === false) body.same_domain_only = false;

		const include = splitPatterns(options.includePatterns);
		if (include.length > 0) body.include_patterns = include;
		const exclude = splitPatterns(options.excludePatterns);
		if (exclude.length > 0) body.exclude_patterns = exclude;
	}

	if (options.respectRobots === true) body.respect_robots = true;
	if (typeof options.waitFor === 'string' && options.waitFor !== '')
		body.wait_for = options.waitFor;
	if (options.webhookUrl) body.webhook_url = options.webhookUrl;

	const chunk: IDataObject = {};
	if (typeof options.chunkMaxWords === 'number') chunk.max_words = options.chunkMaxWords;
	if (typeof options.chunkSentenceOverlap === 'number') {
		chunk.sentence_overlap = options.chunkSentenceOverlap;
	}
	if (Object.keys(chunk).length > 0) body.chunk = chunk;

	const submitted = await apiRequest.call(this, 'POST', '/v2/ingest', body, undefined, itemIndex);

	return await resolveIngestJob.call(this, submitted, outputMode, wait, itemIndex);
}
