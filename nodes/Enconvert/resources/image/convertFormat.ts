import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

import { readInputFile } from '../../shared/binary';
import { runConversion, type ResponseFormat } from '../../shared/convert';
import {
	inputBinaryField,
	outputBinaryField,
	responseFormatBinaryDefault,
} from '../../shared/descriptions';
import { resolveRoute } from '../../shared/routes';

const showOnlyForConvertFormat = { resource: ['image'], operation: ['convertFormat'] };

export const convertFormatFields: INodeProperties[] = [
	{
		displayName:
			'Accepts JPEG, PNG, WebP, HEIC and SVG. A PDF can also be turned into JPEG; a PDF with more than one page comes back as a ZIP.',
		name: 'convertFormatNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForConvertFormat },
	},
	{ ...inputBinaryField, displayOptions: { show: showOnlyForConvertFormat } },
	{
		displayName: 'Convert To',
		name: 'target',
		type: 'options',
		default: 'png',
		required: true,
		description: 'Image format to produce',
		displayOptions: { show: showOnlyForConvertFormat },
		options: [
			{ name: 'HEIC', value: 'heic' },
			{ name: 'JPEG', value: 'jpeg' },
			{ name: 'PNG', value: 'png' },
			{ name: 'SVG', value: 'svg' },
			{ name: 'WebP', value: 'webp' },
		],
	},
	{ ...responseFormatBinaryDefault, displayOptions: { show: showOnlyForConvertFormat } },
	{
		...outputBinaryField,
		displayOptions: { show: { ...showOnlyForConvertFormat, responseFormat: ['binary'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForConvertFormat },
		options: [
			{
				displayName: 'Height (Pixels)',
				name: 'height',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 1, maxValue: 10000 },
				description:
					'Only applies when converting an SVG to JPEG, PNG or WebP. Width multiplied by height cannot exceed 25 million.',
			},
			{
				displayName: 'Input File Format',
				name: 'inputFormat',
				type: 'string',
				default: '',
				placeholder: 'e.g. png',
				description: 'Set this when the incoming file has no extension in its name',
			},
			{
				displayName: 'Output File Name',
				name: 'outputFileName',
				type: 'string',
				default: '',
				placeholder: 'e.g. photo.webp',
				description: 'Defaults to the input file name with the new extension',
			},
			{
				displayName: 'Width (Pixels)',
				name: 'width',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 1, maxValue: 10000 },
				description:
					'Only applies when converting an SVG to JPEG, PNG or WebP. Width multiplied by height cannot exceed 25 million.',
			},
		],
	},
];

export async function executeConvertFormat(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
	const target = this.getNodeParameter('target', itemIndex) as string;
	const responseFormat = this.getNodeParameter('responseFormat', itemIndex) as ResponseFormat;
	const outputBinaryPropertyName = this.getNodeParameter(
		'outputBinaryPropertyName',
		itemIndex,
		'data',
	) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const file = await readInputFile.call(
		this,
		itemIndex,
		binaryPropertyName,
		options.inputFormat as string | undefined,
	);
	const route = resolveRoute(this.getNode(), file.extension, target, itemIndex);

	const warnings: string[] = [];
	const extraFields: IDataObject = {};
	const width = options.width as number | undefined;
	const height = options.height as number | undefined;

	if (width || height) {
		if (route.widthHeight) {
			if (width) extraFields.width = String(width);
			if (height) extraFields.height = String(height);
		} else {
			warnings.push(
				'Width and Height only apply when converting an SVG to JPEG, PNG or WebP, so they were ignored',
			);
		}
	}

	return await runConversion.call(this, {
		itemIndex,
		route,
		file,
		extraFields,
		outputExtension: target,
		outputFileNameOverride: options.outputFileName as string | undefined,
		responseFormat,
		outputBinaryPropertyName,
		warnings,
	});
}
