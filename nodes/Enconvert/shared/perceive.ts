import type { IBinaryData, IDataObject, IExecuteFunctions, INodeProperties } from 'n8n-workflow';

import { attachOutputFile, fetchText } from './binary';

/** Artifacts EnConvert stores as files and returns as 15-minute signed URLs. */
interface OutputArtifact {
	url?: string;
	object_key?: string;
	size_bytes?: number;
	content_type?: string;
}

export interface PerceiveResult extends IDataObject {
	operation_id?: string;
	status?: string;
	url?: string;
	url_final?: string;
	content_hash?: string;
	render_quality?: number;
	/** Content-free block: HTTP 200, empty outputs, not billed. */
	is_blocked?: boolean;
	/** False when the read was not charged (blocked, http_error, login_wall). */
	billed?: boolean;
	cache_hit?: boolean;
	outputs?: Record<string, OutputArtifact>;
	structured?: IDataObject;
	extraction_tier?: string;
	cost_cents?: number;
	duration_ms?: number;
	error?: string;
	warnings?: string[];
}

/** Artifact name -> key it lands under in the item's json. */
const TEXT_ARTIFACTS: Record<string, string> = {
	markdown: 'markdown',
	html_cleaned: 'htmlCleaned',
	html_raw: 'htmlRaw',
};

/** Artifact name -> json key, parsed from JSON before being attached. */
const JSON_ARTIFACTS: Record<string, string> = {
	links: 'links',
	images: 'images',
};

/** Artifact name -> binary field name + file extension. */
const BINARY_ARTIFACTS: Record<string, { field: string; extension: string; mimeType: string }> = {
	screenshot: { field: 'screenshot', extension: 'png', mimeType: 'image/png' },
	screenshot_full_page: {
		field: 'screenshotFullPage',
		extension: 'png',
		mimeType: 'image/png',
	},
	pdf: { field: 'pdf', extension: 'pdf', mimeType: 'application/pdf' },
};

export const outputsField: INodeProperties = {
	displayName: 'Outputs',
	name: 'outputs',
	type: 'multiOptions',
	default: ['markdown'],
	description:
		'What to produce from the page. Markdown is roughly six times smaller than raw HTML, which cuts the cost of every AI node downstream.',
	options: [
		{
			name: 'Cleaned HTML',
			value: 'html_cleaned',
			description: 'HTML with navigation and boilerplate removed',
		},
		{
			name: 'Full-Page Screenshot',
			value: 'screenshot_full_page',
			description: 'PNG of the entire scrollable page',
		},
		{ name: 'Images', value: 'images', description: 'Every image found on the page' },
		{ name: 'Links', value: 'links', description: 'Every link found on the page' },
		{
			name: 'Markdown',
			value: 'markdown',
			description: 'The page as markdown text, trimmed to the main content by default',
		},
		{ name: 'PDF', value: 'pdf', description: 'The rendered page as a PDF file' },
		{ name: 'Raw HTML', value: 'html_raw', description: 'The page HTML exactly as rendered' },
		{ name: 'Screenshot', value: 'screenshot', description: 'PNG of the visible area' },
		{
			name: 'Structured Data',
			value: 'structured',
			description: 'Tables, headings, metadata and schema.org data',
		},
	],
};

/** Render knobs shared by Scrape, Scrape Many and Extract. */
export const perceiveOptionFields: INodeProperties[] = [
	{
		displayName: 'Basic Auth Password',
		name: 'authPassword',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description: 'Password for pages behind HTTP basic authentication',
	},
	{
		displayName: 'Basic Auth Username',
		name: 'authUsername',
		type: 'string',
		default: '',
		description: 'Username for pages behind HTTP basic authentication',
	},
	{
		displayName: 'Block Resources',
		name: 'blockResources',
		type: 'multiOptions',
		default: [],
		description: 'Resource types to stop the page from loading, which makes rendering faster',
		options: [
			{ name: 'Fetch', value: 'fetch' },
			{ name: 'Font', value: 'font' },
			{ name: 'Image', value: 'image' },
			{ name: 'Manifest', value: 'manifest' },
			{ name: 'Media', value: 'media' },
			{ name: 'Other', value: 'other' },
			{ name: 'Script', value: 'script' },
			{ name: 'Stylesheet', value: 'stylesheet' },
			{ name: 'WebSocket', value: 'websocket' },
			{ name: 'XHR', value: 'xhr' },
		],
	},
	{
		displayName: 'Cache Mode',
		name: 'cacheMode',
		type: 'options',
		default: 'enabled',
		description: 'Results are cached for about an hour. A cache hit is free and instant.',
		options: [
			{
				name: 'Bypass Cache',
				value: 'bypass',
				description: 'Render fresh and do not store the result',
			},
			{
				name: 'Refresh Cache',
				value: 'refresh',
				description: 'Render fresh and replace the stored result',
			},
			{
				name: 'Use Cache',
				value: 'enabled',
				description: 'Reuse a recent result when there is one',
			},
		],
	},
	{
		displayName: 'Cookies (JSON)',
		name: 'cookies',
		type: 'json',
		default: '',
		placeholder: 'e.g. [{"name":"session","value":"abc","domain":"example.com"}]',
		description: 'Cookies to set before loading the page, as a JSON array. Up to 50.',
	},
	{
		displayName: 'Extract',
		name: 'extract',
		type: 'multiOptions',
		default: [],
		description:
			'Which structured pieces to pull out. Only applies when Structured Data is one of the outputs.',
		options: [
			{ name: 'Headings', value: 'headings' },
			{ name: 'Main Content', value: 'main_content' },
			{ name: 'Metadata', value: 'metadata' },
			{ name: 'Structured Data', value: 'structured_data' },
			{ name: 'Tables', value: 'tables' },
		],
	},
	{
		displayName: 'Headers (JSON)',
		name: 'headers',
		type: 'json',
		default: '',
		placeholder: 'e.g. {"X-Custom":"value"}',
		description: 'Extra request headers, as a JSON object. Up to 20.',
	},
	{
		displayName: 'JavaScript to Run',
		name: 'jsCode',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		placeholder: 'e.g. document.querySelector(".load-more").click()',
		description: 'JavaScript executed on the page after it loads, up to 20000 characters',
	},
	{
		displayName: 'Mobile',
		name: 'mobile',
		type: 'boolean',
		default: false,
		description: 'Whether to render as a phone, using a 390 by 844 viewport',
	},
	{
		displayName: 'Only Main Content',
		name: 'onlyMainContent',
		type: 'boolean',
		default: true,
		description:
			'Whether markdown keeps just the main content of the page, stripping navigation, headers, footers and cookie banners. Turn off to keep the full page with nothing stripped.',
	},
	{
		displayName: 'Respect Robots.txt',
		name: 'respectRobots',
		type: 'boolean',
		default: false,
		description: 'Whether to skip pages the site asks crawlers not to visit',
	},
	{
		displayName: 'Viewport Height',
		name: 'viewportHeight',
		type: 'number',
		default: 1080,
		typeOptions: { minValue: 240, maxValue: 2160 },
	},
	{
		displayName: 'Viewport Width',
		name: 'viewportWidth',
		type: 'number',
		default: 1920,
		typeOptions: { minValue: 320, maxValue: 3840 },
	},
	{
		displayName: 'Wait for Selector',
		name: 'waitFor',
		type: 'string',
		default: '',
		placeholder: 'e.g. .product-price',
		description:
			'Hold the render until this CSS selector appears. Prefix with "js:" to wait for a JavaScript expression instead.',
	},
	{
		displayName: 'Wait Timeout (Ms)',
		name: 'waitTimeoutMs',
		type: 'number',
		default: 30000,
		typeOptions: { minValue: 0, maxValue: 60000 },
		description: 'How long to wait for the selector before continuing anyway',
	},
];

/** Turn the Options collection into the /v2/perceive request body fields. */
export function buildPerceiveOptions(options: IDataObject): IDataObject {
	const payload: IDataObject = {};

	if (Array.isArray(options.extract) && options.extract.length > 0)
		payload.extract = options.extract;
	if (typeof options.waitFor === 'string' && options.waitFor !== '')
		payload.wait_for = options.waitFor;
	if (typeof options.waitTimeoutMs === 'number') payload.wait_timeout_ms = options.waitTimeoutMs;
	if (typeof options.jsCode === 'string' && options.jsCode !== '') payload.js_code = options.jsCode;
	if (typeof options.cacheMode === 'string') payload.cache_mode = options.cacheMode;
	if (options.mobile === true) payload.mobile = true;
	if (options.onlyMainContent === false) payload.only_main_content = false;
	if (options.respectRobots === true) payload.respect_robots = true;
	if (Array.isArray(options.blockResources) && options.blockResources.length > 0) {
		payload.block_resources = options.blockResources;
	}

	const width = options.viewportWidth as number | undefined;
	const height = options.viewportHeight as number | undefined;
	if (width || height) {
		payload.viewport = { width: width ?? 1920, height: height ?? 1080 };
	}

	const headers = parseJsonObject(options.headers);
	if (headers) payload.headers = headers;

	const cookies = parseJsonArray(options.cookies);
	if (cookies) payload.cookies = cookies;

	if (options.authUsername && options.authPassword) {
		payload.auth = { username: options.authUsername, password: options.authPassword };
	}

	return payload;
}

export function parseJsonObject(value: unknown): IDataObject | undefined {
	if (typeof value === 'object' && value !== null && !Array.isArray(value))
		return value as IDataObject;
	if (typeof value !== 'string' || value.trim() === '') return undefined;
	try {
		const parsed = JSON.parse(value) as unknown;
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? (parsed as IDataObject)
			: undefined;
	} catch {
		return undefined;
	}
}

export function parseJsonArray(value: unknown): IDataObject[] | undefined {
	if (Array.isArray(value)) return value as IDataObject[];
	if (typeof value !== 'string' || value.trim() === '') return undefined;
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? (parsed as IDataObject[]) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Shape one perceive result into an n8n item.
 *
 * Every artifact — even markdown — arrives as a signed URL, so text outputs are
 * fetched and inlined into json while screenshots and PDFs become real n8n
 * binary. Competing scrape nodes hand back the URL and leave this to the user.
 */
export async function perceiveToItem(
	this: IExecuteFunctions,
	result: PerceiveResult,
	itemIndex: number,
	downloadArtifacts: boolean,
): Promise<{ json: IDataObject; binary?: { [key: string]: IBinaryData } }> {
	const json: IDataObject = {
		operationId: result.operation_id,
		status: result.status,
		url: result.url,
		urlFinal: result.url_final,
		cacheHit: result.cache_hit,
		renderQuality: result.render_quality,
		isBlocked: result.is_blocked,
		billed: result.billed,
		costCents: result.cost_cents,
		durationMs: result.duration_ms,
	};

	if (result.structured) json.structured = result.structured;
	if (result.extraction_tier) json.extractionTier = result.extraction_tier;
	if (result.error) json.error = result.error;
	if (Array.isArray(result.warnings) && result.warnings.length > 0) json.warnings = result.warnings;

	const outputs = result.outputs ?? {};
	const artifactUrls: IDataObject = {};
	let binary: { [key: string]: IBinaryData } | undefined;

	for (const [name, artifact] of Object.entries(outputs)) {
		if (!artifact?.url) continue;

		if (!downloadArtifacts) {
			artifactUrls[name] = artifact.url;
			continue;
		}

		if (TEXT_ARTIFACTS[name]) {
			json[TEXT_ARTIFACTS[name]] = await fetchText.call(this, artifact.url, itemIndex);
			continue;
		}

		if (JSON_ARTIFACTS[name]) {
			const text = await fetchText.call(this, artifact.url, itemIndex);
			json[JSON_ARTIFACTS[name]] = safeParse(text);
			continue;
		}

		const binarySpec = BINARY_ARTIFACTS[name];
		if (binarySpec) {
			const fileName = `${slugForFileName(result.url ?? 'page')}.${binarySpec.extension}`;
			const attached = await attachOutputFile.call(
				this,
				artifact.url,
				fileName,
				itemIndex,
				binarySpec.field,
				binarySpec.mimeType,
			);
			binary = { ...(binary ?? {}), ...attached };
			continue;
		}

		artifactUrls[name] = artifact.url;
	}

	if (Object.keys(artifactUrls).length > 0) {
		json.artifactUrls = artifactUrls;
		json.artifactUrlsExpireInSeconds = 900;
	}

	return binary ? { json, binary } : { json };
}

function safeParse(text: string): IDataObject | IDataObject[] | string {
	try {
		return JSON.parse(text) as IDataObject | IDataObject[];
	} catch {
		return text;
	}
}

function slugForFileName(url: string): string {
	const withoutScheme = url.replace(/^https?:\/\//i, '');
	const slug = withoutScheme.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
	return (slug || 'page').slice(0, 80).toLowerCase();
}

/** Split a URL list typed as text or arriving as an upstream array. */
export function parseUrlList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
	if (typeof value !== 'string') return [];
	return value
		.split(/[\n,]+/)
		.map((entry) => entry.trim())
		.filter(Boolean);
}
