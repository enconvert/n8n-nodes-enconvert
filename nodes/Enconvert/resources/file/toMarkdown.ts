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

const showOnlyForToMarkdown = { resource: ['file'], operation: ['toMarkdown'] };

export const toMarkdownFields: INodeProperties[] = [
	{
		displayName:
			'Accepts DOC, DOCX, PPT, PPTX, XLS, XLSX, ODT, ODS, ODP, PDF, EPUB, RTF, HTML, CSV and text files. Scanned pages without a text layer are not read.',
		name: 'toMarkdownNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: showOnlyForToMarkdown },
	},
	{ ...inputBinaryField, displayOptions: { show: showOnlyForToMarkdown } },
	{
		...responseFormatTextDefault,
		description:
			'Text puts the markdown into the item so an AI or Set node can read it. File attaches a .md file instead.',
		displayOptions: { show: showOnlyForToMarkdown },
	},
	{
		...outputBinaryField,
		displayOptions: { show: { ...showOnlyForToMarkdown, responseFormat: ['binary'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: showOnlyForToMarkdown },
		options: [
			{
				displayName: 'Input File Format',
				name: 'inputFormat',
				type: 'string',
				default: '',
				placeholder: 'e.g. docx',
				description:
					'Set this when the incoming file has no extension in its name, for example a download from an HTTP Request node',
			},
			{
				displayName: 'Output File Name',
				name: 'outputFileName',
				type: 'string',
				default: '',
				placeholder: 'e.g. report.md',
				description:
					'Only used when Response Format is File. Defaults to the input name with a .md extension.',
			},
		],
	},
];

export async function executeToMarkdown(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
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
	const route = resolveRoute(this.getNode(), file.extension, 'md', itemIndex);

	return await runConversion.call(this, {
		itemIndex,
		route,
		file,
		outputExtension: 'md',
		outputFileNameOverride: options.outputFileName as string | undefined,
		responseFormat,
		outputBinaryPropertyName,
	});
}
