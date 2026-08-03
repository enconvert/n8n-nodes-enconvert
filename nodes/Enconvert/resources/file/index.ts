import type { INodeProperties } from 'n8n-workflow';

import { convertDataFields } from './convertData';
import { splitIntoChunksFields } from './splitIntoChunks';
import { toMarkdownFields } from './toMarkdown';
import { toPdfFields } from './toPdf';

const showOnlyForFile = { resource: ['file'] };

export const fileDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForFile },
		default: 'toPdf',
		options: [
			{
				name: 'Convert Data',
				value: 'convertData',
				action: 'Convert data file to another format',
				description: 'Convert between JSON, CSV, XML, YAML, TOML and HTML',
			},
			{
				name: 'Convert to Markdown',
				value: 'toMarkdown',
				action: 'Convert file to markdown',
				description:
					'Turn a Word, PowerPoint, Excel, PDF, EPUB or HTML file into markdown text an AI model can read',
			},
			{
				name: 'Convert to PDF',
				value: 'toPdf',
				action: 'Convert file to PDF',
				description:
					'Turn a document, spreadsheet, presentation, web page, image or text file into a PDF',
			},
			{
				name: 'Split Into Chunks',
				value: 'splitIntoChunks',
				action: 'Split files into AI ready chunks',
				description: 'Break documents into overlapping passages ready to embed in a vector store',
			},
		],
	},
	...toPdfFields,
	...toMarkdownFields,
	...convertDataFields,
	...splitIntoChunksFields,
];
