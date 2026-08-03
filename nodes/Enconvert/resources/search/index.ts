import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

import { perceiveToItem, type PerceiveResult } from '../../shared/perceive';
import { apiRequest } from '../../shared/transport';

const showOnlyForSearch = { resource: ['search'], operation: ['search'] };

interface LookupResult extends IDataObject {
	title?: string;
	url?: string;
	snippet?: string;
	position?: number;
	source?: string;
	date?: string;
	image_url?: string;
	thumbnail_url?: string;
	extra?: IDataObject;
	perceive?: PerceiveResult;
}

interface LookupResponse extends IDataObject {
	lookup_id?: string;
	query?: string;
	total?: number;
	results?: LookupResult[];
	answer_box?: IDataObject;
	knowledge_graph?: IDataObject;
	answer?: string;
	answer_sources?: IDataObject[];
	credits?: number;
	cost_cents?: number;
	warnings?: string[];
}

export const searchDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['search'] } },
		default: 'search',
		options: [
			{
				name: 'Search',
				value: 'search',
				action: 'Search the web',
				description:
					'Run a web, news, image, scholar, patent or maps search and optionally read the top results',
			},
		],
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. best CRM for small agencies 2026',
		description: 'What to search for',
		displayOptions: { show: showOnlyForSearch },
	},
	{
		displayName: 'Category',
		name: 'category',
		type: 'options',
		default: 'web',
		description: 'Which index to search',
		displayOptions: { show: showOnlyForSearch },
		options: [
			{ name: 'Images', value: 'images' },
			{ name: 'Maps', value: 'maps' },
			{ name: 'News', value: 'news' },
			{ name: 'Patents', value: 'patents' },
			{ name: 'Scholar', value: 'scholar' },
			{ name: 'Web', value: 'web' },
		],
	},
	{
		// Named "Number of Results" rather than "Limit" on purpose: every result
		// is billed, so the n8n house default of 50 would be an expensive surprise.
		displayName: 'Number of Results',
		name: 'numResults',
		type: 'number',
		default: 10,
		typeOptions: { minValue: 1, maxValue: 100 },
		description: 'How many results to return',
		displayOptions: { show: showOnlyForSearch },
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description:
			'Whether to return a shortened version of the results rather than every field the search engine sent',
		displayOptions: { show: showOnlyForSearch },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForSearch },
		options: [
			{
				displayName: 'Answer Prompt',
				name: 'answerPrompt',
				type: 'string',
				default: '',
				placeholder: 'e.g. summarise the pricing of each tool mentioned',
				description: 'Steers the written answer. Only used when Synthesize Answer is on.',
			},
			{
				displayName: 'Autocorrect',
				name: 'autocorrect',
				type: 'boolean',
				default: true,
				description: 'Whether to let the search engine fix spelling in the query',
			},
			{
				displayName: 'Country',
				name: 'country',
				type: 'string',
				default: '',
				placeholder: 'e.g. gb',
				description: 'Two-letter country code to search from',
			},
			{
				displayName: 'Locale',
				name: 'locale',
				type: 'string',
				default: '',
				placeholder: 'e.g. en',
				description: 'Language code for the results',
			},
			{
				displayName: 'Location',
				name: 'location',
				type: 'string',
				default: '',
				placeholder: 'e.g. Manchester, United Kingdom',
				description: 'Place to search as if you were there, which matters most for Maps',
			},
			{
				displayName: 'Page',
				name: 'page',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 1, maxValue: 10 },
				description: 'Which page of results to fetch',
			},
			{
				displayName: 'Scrape Top Results',
				name: 'perceiveTop',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0, maxValue: 10 },
				description:
					'Also render this many of the top results and attach their markdown, so you get the search page and the page contents in one run',
			},
			{
				displayName: 'Synthesize Answer',
				name: 'synthesizeAnswer',
				type: 'boolean',
				default: false,
				description:
					'Whether to have EnConvert write a single answer from the results. Appears on the first item.',
			},
			{
				displayName: 'Time Filter',
				name: 'timeFilter',
				type: 'options',
				default: 'week',
				description: 'Only return results published within this window',
				options: [
					{ name: 'Past Day', value: 'day' },
					{ name: 'Past Hour', value: 'hour' },
					{ name: 'Past Month', value: 'month' },
					{ name: 'Past Week', value: 'week' },
					{ name: 'Past Year', value: 'year' },
				],
			},
		],
	},
];

export async function executeSearch(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const query = this.getNodeParameter('query', itemIndex) as string;
	const category = this.getNodeParameter('category', itemIndex, 'web') as string;
	const numResults = this.getNodeParameter('numResults', itemIndex, 10) as number;
	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const body: IDataObject = { query, category, num_results: numResults };

	if (options.country) body.country = options.country;
	if (options.locale) body.locale = options.locale;
	if (options.timeFilter) body.time_filter = options.timeFilter;
	if (typeof options.page === 'number') body.page = options.page;
	if (options.location) body.location = options.location;
	if (options.autocorrect === false) body.autocorrect = false;

	const perceiveTop = options.perceiveTop as number | undefined;
	if (perceiveTop && perceiveTop > 0) {
		body.perceive_top = perceiveTop;
		const enrich: IDataObject = { outputs: ['markdown'] };
		if (options.synthesizeAnswer === true) {
			enrich.synthesize_answer = true;
			if (options.answerPrompt) enrich.answer_prompt = options.answerPrompt;
		}
		body.enrich = enrich;
	}

	const response = (await apiRequest.call(
		this,
		'POST',
		'/v2/lookup',
		body,
		undefined,
		itemIndex,
	)) as LookupResponse;

	const results = response.results ?? [];
	if (results.length === 0) {
		return [
			{
				json: { query: response.query, total: 0, warnings: response.warnings },
				pairedItem: { item: itemIndex },
			},
		];
	}

	const output: INodeExecutionData[] = [];

	for (const [index, result] of results.entries()) {
		const json: IDataObject = simplify
			? {
					title: result.title,
					url: result.url,
					snippet: result.snippet,
					position: result.position,
					source: result.source,
					date: result.date,
				}
			: { ...result };

		let binary;
		if (result.perceive) {
			const rendered = await perceiveToItem.call(this, result.perceive, itemIndex, true);
			if (typeof rendered.json.markdown === 'string') json.markdown = rendered.json.markdown;
			if (rendered.json.structured) json.structured = rendered.json.structured;
			binary = rendered.binary;
		}

		// Answer-level fields belong to the search, not to any one result.
		if (index === 0) {
			if (response.answer) json.answer = response.answer;
			if (response.answer_sources) json.answerSources = response.answer_sources;
			if (response.answer_box) json.answerBox = response.answer_box;
			if (response.knowledge_graph) json.knowledgeGraph = response.knowledge_graph;
			if (Array.isArray(response.warnings) && response.warnings.length > 0) {
				json.warnings = response.warnings;
			}
		}

		output.push(
			binary
				? { json, binary, pairedItem: { item: itemIndex } }
				: { json, pairedItem: { item: itemIndex } },
		);
	}

	return output;
}
