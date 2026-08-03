import type { INodeProperties } from 'n8n-workflow';

/**
 * Shared property blocks. Labels follow n8n's own file nodes verbatim
 * (Extract From File / Convert to File) so the node reads as native, and
 * because node-ui-design forbids the words "binary data" in a label.
 */

export const inputBinaryField: INodeProperties = {
	displayName: 'Input Binary Field',
	name: 'binaryPropertyName',
	type: 'string',
	default: 'data',
	required: true,
	placeholder: 'e.g. data',
	hint: 'The name of the input field containing the file to convert',
};

export const outputBinaryField: INodeProperties = {
	displayName: 'Put Output File in Field',
	name: 'outputBinaryPropertyName',
	type: 'string',
	default: 'data',
	placeholder: 'e.g. data',
	hint: 'The name of the output field to put the converted file in',
};

export const responseFormatBinaryDefault: INodeProperties = {
	displayName: 'Response Format',
	name: 'responseFormat',
	type: 'options',
	default: 'binary',
	description: 'How to return the converted file',
	options: [
		{
			name: 'File',
			value: 'binary',
			description: 'Attach the converted file to the item so later nodes can use it',
		},
		{
			name: 'Text',
			value: 'text',
			description: 'Put the contents into the item as text, for text-based formats',
		},
		{
			name: 'URL Only',
			value: 'url',
			description:
				'Return just a download link and skip the transfer. Use for files above 16 MB, which n8n Cloud cannot hold in an item. The link expires after 15 minutes.',
		},
	],
};

export const responseFormatTextDefault: INodeProperties = {
	...responseFormatBinaryDefault,
	default: 'text',
};

/** PDF page geometry. Hidden where the gateway rejects it (office inputs). */
export const pdfOptionsCollection: INodeProperties = {
	displayName: 'PDF Options',
	name: 'pdfOptions',
	type: 'collection',
	placeholder: 'Add PDF option',
	default: {},
	options: [
		{
			displayName: 'Footer HTML',
			name: 'footer',
			type: 'string',
			default: '',
			placeholder: 'e.g. <span>Page </span>',
			description: 'HTML placed at the bottom of every page',
		},
		{
			displayName: 'Grayscale',
			name: 'grayscale',
			type: 'boolean',
			default: false,
			description: 'Whether to render the PDF without colour',
		},
		{
			displayName: 'Header HTML',
			name: 'header',
			type: 'string',
			default: '',
			placeholder: 'e.g. <span>Invoice</span>',
			description: 'HTML placed at the top of every page',
		},
		{
			displayName: 'Margin Bottom (Inches)',
			name: 'marginBottom',
			type: 'number',
			default: 10,
			typeOptions: { minValue: 0 },
		},
		{
			displayName: 'Margin Left (Inches)',
			name: 'marginLeft',
			type: 'number',
			default: 10,
			typeOptions: { minValue: 0 },
		},
		{
			displayName: 'Margin Right (Inches)',
			name: 'marginRight',
			type: 'number',
			default: 10,
			typeOptions: { minValue: 0 },
		},
		{
			displayName: 'Margin Top (Inches)',
			name: 'marginTop',
			type: 'number',
			default: 10,
			typeOptions: { minValue: 0 },
		},
		{
			displayName: 'Orientation',
			name: 'orientation',
			type: 'options',
			default: 'portrait',
			options: [
				{ name: 'Landscape', value: 'landscape' },
				{ name: 'Portrait', value: 'portrait' },
			],
		},
		{
			displayName: 'Page Size',
			name: 'pageSize',
			type: 'options',
			default: 'A4',
			description: 'Paper size to lay the content out on',
			options: [
				{ name: 'A0', value: 'A0' },
				{ name: 'A1', value: 'A1' },
				{ name: 'A2', value: 'A2' },
				{ name: 'A3', value: 'A3' },
				{ name: 'A4', value: 'A4' },
				{ name: 'A5', value: 'A5' },
				{ name: 'A6', value: 'A6' },
				{ name: 'B0', value: 'B0' },
				{ name: 'B1', value: 'B1' },
				{ name: 'B2', value: 'B2' },
				{ name: 'B3', value: 'B3' },
				{ name: 'B4', value: 'B4' },
				{ name: 'B5', value: 'B5' },
				{ name: 'Ledger', value: 'Ledger' },
				{ name: 'Legal', value: 'Legal' },
				{ name: 'Letter', value: 'Letter' },
				{ name: 'Tabloid', value: 'Tabloid' },
			],
		},
		{
			displayName: 'Scale',
			name: 'scale',
			type: 'number',
			default: 1,
			typeOptions: { minValue: 0.1, maxValue: 2, numberPrecision: 2 },
			description: 'Zoom factor applied to the rendered content, between 0.1 and 2',
		},
	],
};

export const waitForCompletionOption: INodeProperties = {
	displayName: 'Wait for Completion',
	name: 'waitForCompletion',
	type: 'boolean',
	default: true,
	description:
		'Whether to hold the workflow until the job finishes. Turn off to get the job ID straight away and check it later with the Job resource.',
};

export const maxWaitSecondsOption: INodeProperties = {
	displayName: 'Max Wait Time (Seconds)',
	name: 'maxWaitSeconds',
	type: 'number',
	default: 120,
	typeOptions: { minValue: 5, maxValue: 3600 },
	description:
		'How long to wait before giving up. The job keeps running on EnConvert and the ID is returned in the error so you can collect it later. Values above 300 can be cut short by the execution timeout on n8n Cloud.',
};

export const pollIntervalOption: INodeProperties = {
	displayName: 'Poll Interval (Seconds)',
	name: 'pollIntervalSeconds',
	type: 'number',
	default: 3,
	typeOptions: { minValue: 1, maxValue: 60 },
	description: 'How often to check whether the job has finished',
};

/** The three wait knobs, for spreading into an operation's Options collection. */
export const waitOptionFields: INodeProperties[] = [
	maxWaitSecondsOption,
	pollIntervalOption,
	waitForCompletionOption,
];
