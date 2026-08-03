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
	responseFormatTextDefault,
} from '../../shared/descriptions';
import { resolveRoute } from '../../shared/routes';

const showOnlyForConvertData = { resource: ['file'], operation: ['convertData'] };

export const convertDataFields: INodeProperties[] = [
	{
		displayName:
			'Supported conversions: JSON to and from XML, YAML, TOML and CSV; CSV to and from XML; Markdown to HTML.',
		name: 'convertDataNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForConvertData },
	},
	{ ...inputBinaryField, displayOptions: { show: showOnlyForConvertData } },
	{
		displayName: 'Convert To',
		name: 'target',
		type: 'options',
		default: 'json',
		required: true,
		description: 'Format to produce',
		displayOptions: { show: showOnlyForConvertData },
		options: [
			{ name: 'CSV', value: 'csv' },
			{ name: 'HTML', value: 'html' },
			{ name: 'JSON', value: 'json' },
			{ name: 'TOML', value: 'toml' },
			{ name: 'XML', value: 'xml' },
			{ name: 'YAML', value: 'yaml' },
		],
	},
	{
		...responseFormatTextDefault,
		description:
			'Text puts the converted contents into the item. Converting to JSON gives a ready-to-use object under "data".',
		displayOptions: { show: showOnlyForConvertData },
	},
	{
		...outputBinaryField,
		displayOptions: { show: { ...showOnlyForConvertData, responseFormat: ['binary'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForConvertData },
		options: [
			{
				displayName: 'Input File Format',
				name: 'inputFormat',
				type: 'string',
				default: '',
				placeholder: 'e.g. csv',
				description:
					'Set this when the incoming file has no extension in its name, for example a download from an HTTP Request node',
			},
			{
				displayName: 'Output File Name',
				name: 'outputFileName',
				type: 'string',
				default: '',
				placeholder: 'e.g. contacts.json',
				description: 'Defaults to the input file name with the new extension',
			},
		],
	},
];

export async function executeConvertData(
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

	return await runConversion.call(this, {
		itemIndex,
		route,
		file,
		outputExtension: target,
		outputFileNameOverride: options.outputFileName as string | undefined,
		responseFormat,
		outputBinaryPropertyName,
	});
}
