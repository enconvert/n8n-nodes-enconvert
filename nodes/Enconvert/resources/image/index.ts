import type { INodeProperties } from 'n8n-workflow';

import { compressFields } from './compress';
import { convertFormatFields } from './convertFormat';

const showOnlyForImage = { resource: ['image'] };

export const imageDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForImage },
		default: 'convertFormat',
		options: [
			{
				name: 'Compress',
				value: 'compress',
				action: 'Compress image',
				description: 'Shrink a PNG, JPEG or WebP towards a target file size',
			},
			{
				name: 'Convert Format',
				value: 'convertFormat',
				action: 'Convert image to another format',
				description: 'Convert between JPEG, PNG, WebP, HEIC and SVG, or turn a PDF page into JPEG',
			},
		],
	},
	...convertFormatFields,
	...compressFields,
];
