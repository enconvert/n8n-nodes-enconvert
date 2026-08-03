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
import { findRouteByName } from '../../shared/routes';
import { NodeOperationError } from 'n8n-workflow';

const showOnlyForCompress = { resource: ['image'], operation: ['compress'] };
const COMPRESSIBLE = new Set(['png', 'jpg', 'jpeg', 'webp']);

export const compressFields: INodeProperties[] = [
	{
		displayName:
			'Accepts PNG, JPEG and WebP. The format stays the same; only the file size changes.',
		name: 'compressNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForCompress },
	},
	{ ...inputBinaryField, displayOptions: { show: showOnlyForCompress } },
	{
		displayName: 'Target Size (KB)',
		name: 'targetSizeKb',
		type: 'number',
		default: 500,
		typeOptions: { minValue: 1 },
		description:
			'Size to aim for. This is a best effort: if the target cannot be reached, the smallest result achieved is returned rather than an error.',
		displayOptions: { show: showOnlyForCompress },
	},
	{ ...responseFormatBinaryDefault, displayOptions: { show: showOnlyForCompress } },
	{
		...outputBinaryField,
		displayOptions: { show: { ...showOnlyForCompress, responseFormat: ['binary'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForCompress },
		options: [
			{
				displayName: 'Input File Format',
				name: 'inputFormat',
				type: 'string',
				default: '',
				placeholder: 'e.g. jpeg',
				description: 'Set this when the incoming file has no extension in its name',
			},
			{
				displayName: 'Output File Name',
				name: 'outputFileName',
				type: 'string',
				default: '',
				placeholder: 'e.g. photo-small.jpg',
				description: 'Defaults to the input file name',
			},
		],
	},
];

export async function executeCompress(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
	const targetSizeKb = this.getNodeParameter('targetSizeKb', itemIndex) as number;
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

	if (!COMPRESSIBLE.has(file.extension)) {
		throw new NodeOperationError(
			this.getNode(),
			`EnConvert cannot compress .${file.extension} files`,
			{
				itemIndex,
				description:
					'Compress accepts PNG, JPEG and WebP. Use Image > Convert Format first to reach one of those.',
			},
		);
	}

	const route = findRouteByName('compress-image');
	if (!route) {
		throw new NodeOperationError(this.getNode(), 'Compress is unavailable in this node version', {
			itemIndex,
		});
	}

	return await runConversion.call(this, {
		itemIndex,
		route,
		file,
		extraFields: { target_size_kb: String(targetSizeKb) },
		// compress-image keeps the input's extension.
		outputExtension: file.extension,
		outputFileNameOverride: options.outputFileName as string | undefined,
		responseFormat,
		outputBinaryPropertyName,
	});
}
