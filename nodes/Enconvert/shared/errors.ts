import type { IDataObject, INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

const DASHBOARD_BILLING = 'https://www.enconvert.com/dashboard/billing';
const DASHBOARD_KEYS = 'https://www.enconvert.com/dashboard/api-keys';

interface GatewayError {
	statusCode: number;
	body: IDataObject;
}

/**
 * The gateway emits three different error envelopes:
 *   1. FastAPI HTTPException  -> { detail: string | object | array }
 *   2. ConversionError        -> { error, code, detail, upstream_status }
 *   3. Unhandled              -> { error, event_id }
 * Pull a human sentence out of whichever one arrived.
 */
function extractMessage(body: IDataObject): string | undefined {
	const detail = body.detail;

	// Envelope 2 carries both a status phrase and the specific cause; keep both,
	// otherwise "Bad Gateway" or "site refused" reaches the user without context.
	if (typeof body.error === 'string' && body.error.length > 0) {
		return typeof detail === 'string' && detail.length > 0
			? `${body.error}: ${detail}`
			: body.error;
	}

	if (typeof detail === 'string' && detail.length > 0) return detail;

	// 413 sends a structured dict: { error, file_size, max_size, tier, key_type }
	if (detail !== null && typeof detail === 'object' && !Array.isArray(detail)) {
		const structured = detail as IDataObject;
		if (typeof structured.error === 'string') {
			if (typeof structured.file_size === 'number' && typeof structured.max_size === 'number') {
				const actual = formatBytes(structured.file_size);
				const allowed = formatBytes(structured.max_size);
				const tier = typeof structured.tier === 'string' ? structured.tier : 'current';
				return `File is ${actual}; the ${tier} plan allows ${allowed} per file`;
			}
			return structured.error;
		}
	}

	// Pydantic validation errors arrive as an array of { loc, msg, type }.
	if (Array.isArray(detail) && detail.length > 0) {
		const first = detail[0] as IDataObject;
		if (typeof first?.msg === 'string') {
			const location = Array.isArray(first.loc) ? first.loc.filter(Boolean).join('.') : undefined;
			return location ? `${location}: ${first.msg}` : first.msg;
		}
	}

	return undefined;
}

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} bytes`;
}

function readGatewayError(error: unknown): GatewayError | undefined {
	if (error === null || typeof error !== 'object') return undefined;
	const candidate = error as IDataObject & { response?: IDataObject; cause?: IDataObject };

	const statusCode =
		toStatus(candidate.httpCode) ??
		toStatus(candidate.statusCode) ??
		toStatus(candidate.status) ??
		toStatus(candidate.response?.status) ??
		toStatus(candidate.cause?.statusCode);
	if (statusCode === undefined) return undefined;

	const rawBody =
		(candidate.response?.body as IDataObject | undefined) ??
		(candidate.error as IDataObject | undefined) ??
		(candidate.body as IDataObject | undefined) ??
		{};

	return { statusCode, body: typeof rawBody === 'object' ? rawBody : {} };
}

function toStatus(value: unknown): number | undefined {
	if (typeof value === 'number') return value;
	if (typeof value === 'string' && /^\d{3}$/.test(value)) return Number(value);
	return undefined;
}

/**
 * Turn any failure from the EnConvert API into a NodeApiError carrying a
 * message the user can act on. Never lets a raw TypeError escape.
 */
export function toNodeApiError(node: INode, error: unknown, itemIndex: number): NodeApiError {
	if (error instanceof NodeApiError) return error;

	const gateway = readGatewayError(error);
	const fallback = error instanceof Error ? error.message : 'Unknown error';
	const detail = gateway ? (extractMessage(gateway.body) ?? fallback) : fallback;

	let message = detail;
	let description: string | undefined;

	switch (gateway?.statusCode) {
		case 401:
		case 403:
			message = 'EnConvert rejected the API key';
			description = `Open the credential and check the key. Web Page, Website and Search operations need a private key starting with "sk_" — public "pk_" keys are browser-only. Get one at ${DASHBOARD_KEYS}. (${detail})`;
			break;
		case 402:
			message =
				'This operation is not included in your EnConvert plan, or the monthly allowance is used up';
			description = `Retrying now will not succeed. Review your plan at ${DASHBOARD_BILLING}. (${detail})`;
			break;
		case 413:
			message = detail;
			description = `Upgrade the plan for a larger per-file limit, or split the file before converting. See ${DASHBOARD_BILLING}.`;
			break;
		case 429:
			message = 'EnConvert rate limit reached';
			description =
				'Slow the workflow down, add a Wait node between items, or upgrade the plan for a higher limit.';
			break;
		case 415:
			message = detail;
			description = 'The file contents do not match the format the operation expects.';
			break;
		case 422:
			message = detail;
			description =
				'One of the options sent to EnConvert was not accepted. Check the fields on this node.';
			break;
		case 503:
			message = 'EnConvert is at capacity or this conversion is unavailable';
			description = `Retry in a few seconds. If it persists, the conversion may not be implemented yet. (${detail})`;
			break;
		case 504:
			message = 'EnConvert timed out while converting';
			description =
				'Large or slow pages can exceed the limit. Try a smaller file, or raise Max Wait Time on this node.';
			break;
		default:
			break;
	}

	return new NodeApiError(node, (gateway?.body ?? {}) as JsonObject, {
		message,
		description,
		httpCode: gateway ? String(gateway.statusCode) : undefined,
		itemIndex,
	});
}
