// Lookup helpers over the generated (from, to) -> endpoint table.
// Ported from cli/src/api/routes.ts; errors are raised as NodeOperationError so
// an unsupported pair is rejected in the editor, before any network call.
import type { INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { UPLOAD_ROUTES, type UploadRoute } from './routes.generated';

/** Format-name aliases users type vs the canonical route vocabulary. */
const FORMAT_ALIASES: Record<string, string> = {
	jpg: 'jpeg',
	yml: 'yaml',
	markdown: 'md',
	htm: 'html',
	heif: 'heic',
	tif: 'tiff',
	excel: 'xlsx',
	word: 'docx',
	powerpoint: 'pptx',
	xhtml: 'html',
};

export function canonicalFormat(format: string): string {
	const normalized = format.toLowerCase().replace(/^\./, '');
	return FORMAT_ALIASES[normalized] ?? normalized;
}

/** Output format each route produces, canonicalized (md, pdf, png, ...). */
function routeTarget(route: UploadRoute): string {
	return canonicalFormat(route.to);
}

function acceptsExtension(route: UploadRoute, extension: string): boolean {
	return route.from.includes(`.${extension}`);
}

/** Every output format reachable from the given input extension. */
export function targetsFor(inputExtension: string): string[] {
	const rawExtension = inputExtension.toLowerCase().replace(/^\./, '');
	const canonical = canonicalFormat(rawExtension);
	const targets = UPLOAD_ROUTES.filter(
		(route) => acceptsExtension(route, rawExtension) || acceptsExtension(route, canonical),
	).map(routeTarget);
	return [...new Set(targets)].sort();
}

/**
 * Resolve the endpoint for (input extension, target format).
 * Preference order: specific pair route > universal (anything-to-*) route,
 * matching the CLI and SDK so all clients hit the same endpoint for a pair.
 */
export function resolveRoute(
	node: INode,
	inputExtension: string,
	target: string,
	itemIndex: number,
): UploadRoute {
	const rawExtension = inputExtension.toLowerCase().replace(/^\./, '');
	const canonical = canonicalFormat(rawExtension);
	const canonicalTarget = canonicalFormat(target);

	const candidates = UPLOAD_ROUTES.filter(
		(route) =>
			routeTarget(route) === canonicalTarget &&
			(acceptsExtension(route, rawExtension) || acceptsExtension(route, canonical)),
	);

	if (candidates.length === 0) {
		const available = targetsFor(rawExtension);
		const description = available.length
			? `Files ending in .${rawExtension} can be converted to: ${available.join(', ')}.`
			: `EnConvert has no conversions that accept .${rawExtension} files.`;
		throw new NodeOperationError(
			node,
			`EnConvert cannot convert .${rawExtension} to ${canonicalTarget}`,
			{ itemIndex, description },
		);
	}

	const specific = candidates.find((route) => route.group !== 'universal');
	return specific ?? candidates[0];
}

export function findRouteByName(name: string): UploadRoute | undefined {
	return UPLOAD_ROUTES.find((route) => route.name === name);
}

/** Input extensions a given target format accepts, deduped and sorted. */
export function extensionsProducing(target: string): string[] {
	const canonicalTarget = canonicalFormat(target);
	const extensions = UPLOAD_ROUTES.filter(
		(route) => routeTarget(route) === canonicalTarget,
	).flatMap((route) => route.from);
	return [...new Set(extensions)].sort();
}
