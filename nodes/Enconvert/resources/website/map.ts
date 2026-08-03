import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

import { apiRequest } from '../../shared/transport';

const showOnlyForMap = { resource: ['website'], operation: ['map'] };

interface DiscoverResponse extends IDataObject {
	url?: string;
	mode?: string;
	total?: number;
	urls?: string[];
	pages_crawled?: number;
	truncated?: boolean;
	robots_respected?: boolean;
	sources?: IDataObject;
	warnings?: string[];
}

export const mapFields: INodeProperties[] = [
	{
		displayName:
			'Finds addresses without rendering any page, so it is fast and does not use your page allowance. Feed the result into Web Page > Scrape Many.',
		name: 'mapNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForMap },
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com',
		description: 'Address to start from',
		displayOptions: { show: showOnlyForMap },
	},
	{
		displayName: 'Max URLs',
		name: 'maxUrls',
		type: 'number',
		default: 100,
		typeOptions: { minValue: 1, maxValue: 1000 },
		description: 'How many addresses to return at most',
		displayOptions: { show: showOnlyForMap },
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description:
			'Whether to return one item per address. Turn off for a single item holding the whole list plus counts.',
		displayOptions: { show: showOnlyForMap },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForMap },
		options: [
			{
				displayName: 'Exclude Patterns',
				name: 'excludePatterns',
				type: 'string',
				default: '',
				placeholder: 'e.g. /tag/, /author/',
				description:
					'Skip addresses matching these regular expressions, one per line or separated by commas. Up to 50.',
			},
			{
				displayName: 'Include Patterns',
				name: 'includePatterns',
				type: 'string',
				default: '',
				placeholder: 'e.g. /blog/, /docs/',
				description:
					'Keep only addresses matching these regular expressions, one per line or separated by commas. Up to 50.',
			},
			{
				displayName: 'Max Depth',
				name: 'maxDepth',
				type: 'number',
				default: 2,
				typeOptions: { minValue: 1, maxValue: 5 },
				description: 'How many links deep to follow when crawling',
			},
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				default: 'hybrid',
				description: 'How to find the addresses',
				options: [
					{
						name: 'Crawl Links',
						value: 'crawl',
						description: 'Follow links from the starting page',
					},
					{
						name: 'Sitemap and Crawl',
						value: 'hybrid',
						description: 'Read the sitemap, then fill gaps by crawling',
					},
					{
						name: 'Sitemap Only',
						value: 'sitemap',
						description: 'Read the sitemap and stop, which is fastest',
					},
				],
			},
			{
				displayName: 'Render JavaScript',
				name: 'renderJs',
				type: 'options',
				default: 'auto',
				description:
					'Crawling reads plain HTML by default, so links added by JavaScript are invisible. Turn this up for single-page apps.',
				options: [
					{ name: 'Always', value: 'always' },
					{ name: 'Automatic', value: 'auto' },
					{ name: 'Never', value: 'never' },
				],
			},
			{
				displayName: 'Respect Robots.txt',
				name: 'respectRobots',
				type: 'boolean',
				default: false,
				description: 'Whether to skip addresses the site asks crawlers not to visit',
			},
			{
				displayName: 'Same Domain Only',
				name: 'sameDomainOnly',
				type: 'boolean',
				default: true,
				description: 'Whether to ignore addresses that point at another domain',
			},
		],
	},
];

export async function executeMap(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const url = this.getNodeParameter('url', itemIndex) as string;
	const maxUrls = this.getNodeParameter('maxUrls', itemIndex, 100) as number;
	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const body: IDataObject = { url, max_urls: maxUrls };
	if (options.mode) body.mode = options.mode;
	if (typeof options.maxDepth === 'number') body.max_depth = options.maxDepth;
	if (options.sameDomainOnly === false) body.same_domain_only = false;
	if (options.respectRobots === true) body.respect_robots = true;
	if (options.renderJs) body.render_js = options.renderJs;

	const include = splitPatterns(options.includePatterns);
	if (include.length > 0) body.include_patterns = include;
	const exclude = splitPatterns(options.excludePatterns);
	if (exclude.length > 0) body.exclude_patterns = exclude;

	const response = (await apiRequest.call(
		this,
		'POST',
		'/v2/discover',
		body,
		undefined,
		itemIndex,
	)) as DiscoverResponse;

	const urls = response.urls ?? [];

	if (!simplify || urls.length === 0) {
		return [
			{
				json: {
					url: response.url,
					mode: response.mode,
					total: response.total,
					urls,
					pagesCrawled: response.pages_crawled,
					truncated: response.truncated,
					robotsRespected: response.robots_respected,
					sources: response.sources,
					warnings: response.warnings,
				},
				pairedItem: { item: itemIndex },
			},
		];
	}

	return urls.map((found) => ({
		json: { url: found },
		pairedItem: { item: itemIndex },
	}));
}

export function splitPatterns(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
	if (typeof value !== 'string') return [];
	return value
		.split(/[\n,]+/)
		.map((entry) => entry.trim())
		.filter(Boolean);
}
