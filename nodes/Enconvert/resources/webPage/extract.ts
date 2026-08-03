import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { parseJsonArray, parseJsonObject, parseUrlList } from '../../shared/perceive';
import { apiRequest } from '../../shared/transport';

const showOnlyForExtract = { resource: ['webPage'], operation: ['extract'] };

interface DistillItem extends IDataObject {
	url?: string;
	url_final?: string;
	status?: string;
	data?: IDataObject;
	extraction_tier?: string;
	fields_from_css?: number;
	fields_from_llm?: number;
	render_quality?: number;
	cost_cents?: number;
	error?: string;
	warnings?: string[];
}

interface DistillResponse extends IDataObject {
	operation_id?: string;
	total?: number;
	completed?: number;
	failed?: number;
	results?: DistillItem[];
	total_cost_cents?: number;
	warnings?: string[];
}

export const extractFields: INodeProperties[] = [
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		default: 'urls',
		description: 'Where the pages to read come from',
		displayOptions: { show: showOnlyForExtract },
		options: [
			{ name: 'Specific URLs', value: 'urls', description: 'Up to 50 addresses you provide' },
			{
				name: 'Whole Website',
				value: 'website',
				description: 'Find pages from a starting address, then read them',
			},
		],
	},
	{
		displayName: 'URLs',
		name: 'urls',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/product/1',
		description: 'Addresses to read, one per line or separated by commas. Up to 50.',
		typeOptions: { rows: 3 },
		displayOptions: { show: { ...showOnlyForExtract, source: ['urls'] } },
	},
	{
		displayName: 'Website URL',
		name: 'websiteUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/products',
		description: 'Starting address. EnConvert finds pages from here, then reads each one.',
		displayOptions: { show: { ...showOnlyForExtract, source: ['website'] } },
	},
	{
		displayName: 'Max Pages',
		name: 'maxPages',
		type: 'number',
		default: 10,
		typeOptions: { minValue: 1, maxValue: 50 },
		description: 'How many pages to find and read',
		displayOptions: { show: { ...showOnlyForExtract, source: ['website'] } },
	},
	{
		displayName: 'Define Fields By',
		name: 'defineBy',
		type: 'options',
		default: 'prompt',
		description: 'How to describe the information you want back',
		displayOptions: { show: showOnlyForExtract },
		options: [
			{
				name: 'Description',
				value: 'prompt',
				description: 'Say what you want in plain language and EnConvert works out the shape',
			},
			{
				name: 'Field List',
				value: 'fields',
				description: 'Name each field and describe it',
			},
			{
				name: 'JSON Schema',
				value: 'schema',
				description: 'Supply a JSON Schema for full control over the output shape',
			},
		],
	},
	{
		displayName: 'Description',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		placeholder: 'e.g. the product name, price in GBP, and star rating',
		description: 'What to pull out of each page, in plain language. Up to 2000 characters.',
		displayOptions: { show: { ...showOnlyForExtract, defineBy: ['prompt'] } },
	},
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		placeholder: 'Add field',
		description: 'The fields to return from every page',
		displayOptions: { show: { ...showOnlyForExtract, defineBy: ['fields'] } },
		options: [
			{
				name: 'field',
				displayName: 'Field',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						placeholder: 'e.g. price',
						description: 'Key this value appears under in the output',
					},
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						placeholder: 'e.g. the listed price including currency',
						description: 'What to look for on the page',
					},
				],
			},
		],
	},
	{
		displayName: 'JSON Schema',
		name: 'schema',
		type: 'json',
		default: '',
		required: true,
		placeholder: 'e.g. {"type":"object","properties":{"price":{"type":"number"}}}',
		description: 'JSON Schema describing the output. Up to 200 top-level fields.',
		displayOptions: { show: { ...showOnlyForExtract, defineBy: ['schema'] } },
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description:
			'Whether to return just the extracted fields alongside the URL. Turn off to also get the cost, confidence and which fields came from CSS rather than AI.',
		displayOptions: { show: showOnlyForExtract },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForExtract },
		options: [
			{
				displayName: 'Cookies (JSON)',
				name: 'cookies',
				type: 'json',
				default: '',
				placeholder: 'e.g. [{"name":"session","value":"abc","domain":"example.com"}]',
				description: 'Cookies to set before loading each page, as a JSON array',
			},
			{
				displayName: 'CSS Selectors (JSON)',
				name: 'cssSchema',
				type: 'json',
				default: '',
				placeholder:
					'e.g. {"base_selector":".product","fields":[{"name":"price","type":"text","selector":".price"}]}',
				description:
					'Answer fields with CSS selectors first. Anything a selector cannot reach falls through to AI extraction, so this cuts cost on pages with a fixed layout.',
			},
			{
				displayName: 'Headers (JSON)',
				name: 'headers',
				type: 'json',
				default: '',
				placeholder: 'e.g. {"X-Custom":"value"}',
				description: 'Extra request headers, as a JSON object',
			},
			{
				displayName: 'Respect Robots.txt',
				name: 'respectRobots',
				type: 'boolean',
				default: false,
				description: 'Whether to skip pages the site asks crawlers not to visit',
			},
			{
				displayName: 'Wait for Selector',
				name: 'waitFor',
				type: 'string',
				default: '',
				placeholder: 'e.g. .product-price',
				description: 'Hold each render until this CSS selector appears',
			},
			{
				displayName: 'Wait Timeout (Ms)',
				name: 'waitTimeoutMs',
				type: 'number',
				default: 30000,
				typeOptions: { minValue: 0, maxValue: 60000 },
				description: 'How long to wait for the selector before continuing anyway',
			},
		],
	},
];

export async function executeExtract(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const source = this.getNodeParameter('source', itemIndex) as string;
	const defineBy = this.getNodeParameter('defineBy', itemIndex) as string;
	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const body: IDataObject = {};

	if (source === 'urls') {
		const urls = parseUrlList(this.getNodeParameter('urls', itemIndex));
		if (urls.length === 0) {
			throw new NodeOperationError(this.getNode(), 'No URLs were given', {
				itemIndex,
				description: 'Add at least one address to URLs, one per line or separated by commas.',
			});
		}
		body.urls = urls;
	} else {
		body.discover_from = {
			url: this.getNodeParameter('websiteUrl', itemIndex) as string,
			max_pages: this.getNodeParameter('maxPages', itemIndex, 10) as number,
		};
	}

	if (defineBy === 'prompt') {
		body.prompt = this.getNodeParameter('prompt', itemIndex) as string;
	} else if (defineBy === 'fields') {
		body.schema = buildFlatSchema(
			this.getNodeParameter('fields', itemIndex, {}) as IDataObject,
			this,
			itemIndex,
		);
	} else {
		const schema = parseJsonObject(this.getNodeParameter('schema', itemIndex));
		if (!schema) {
			throw new NodeOperationError(this.getNode(), 'JSON Schema is not valid JSON', {
				itemIndex,
				description: 'Provide a JSON object describing the fields you want back.',
			});
		}
		body.schema = schema;
	}

	const cssSchema = parseJsonObject(options.cssSchema);
	if (cssSchema) body.css_schema = cssSchema;
	if (typeof options.waitFor === 'string' && options.waitFor !== '')
		body.wait_for = options.waitFor;
	if (typeof options.waitTimeoutMs === 'number') body.wait_timeout_ms = options.waitTimeoutMs;
	if (options.respectRobots === true) body.respect_robots = true;

	const headers = parseJsonObject(options.headers);
	if (headers) body.headers = headers;
	const cookies = parseJsonArray(options.cookies);
	if (cookies) body.cookies = cookies;

	const response = (await apiRequest.call(
		this,
		'POST',
		'/v2/distill',
		body,
		undefined,
		itemIndex,
	)) as DistillResponse;

	const results = response.results ?? [];
	if (results.length === 0) {
		return [
			{
				json: {
					operationId: response.operation_id,
					total: response.total,
					completed: response.completed,
					failed: response.failed,
					warnings: response.warnings,
				},
				pairedItem: { item: itemIndex },
			},
		];
	}

	return results.map((result) => ({
		json: simplify
			? {
					url: result.url,
					status: result.status,
					...(result.data ?? {}),
					// Warnings explain why a field came back null (a render that
					// failed, or AI extraction being unavailable on this plan), so
					// they are kept even in the simplified shape.
					...(result.warnings?.length ? { warnings: result.warnings } : {}),
				}
			: {
					url: result.url,
					urlFinal: result.url_final,
					status: result.status,
					data: result.data,
					extractionTier: result.extraction_tier,
					fieldsFromCss: result.fields_from_css,
					fieldsFromLlm: result.fields_from_llm,
					renderQuality: result.render_quality,
					costCents: result.cost_cents,
					error: result.error,
					warnings: result.warnings,
				},
		pairedItem: { item: itemIndex },
	}));
}

/** The Field List mode maps to the API's flat {name: description} schema form. */
function buildFlatSchema(
	fields: IDataObject,
	context: IExecuteFunctions,
	itemIndex: number,
): IDataObject {
	const entries = (fields.field as IDataObject[] | undefined) ?? [];
	const schema: IDataObject = {};

	for (const entry of entries) {
		const name = String(entry.name ?? '').trim();
		if (name === '') continue;
		schema[name] = String(entry.description ?? '').trim() || name;
	}

	if (Object.keys(schema).length === 0) {
		throw new NodeOperationError(context.getNode(), 'No fields were defined', {
			itemIndex,
			description: 'Add at least one field, or switch Define Fields By to Description.',
		});
	}

	return schema;
}
