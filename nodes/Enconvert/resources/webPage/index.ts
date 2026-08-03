import type { INodeProperties } from 'n8n-workflow';

import { extractFields } from './extract';
import { scrapeFields } from './scrape';
import { scrapeManyFields } from './scrapeMany';

const showOnlyForWebPage = { resource: ['webPage'] };

export const webPageDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForWebPage },
		default: 'scrape',
		options: [
			{
				name: 'Extract',
				value: 'extract',
				action: 'Extract structured data from web pages',
				description: 'Pull named fields off one or many pages and get them back as clean JSON',
			},
			{
				name: 'Scrape',
				value: 'scrape',
				action: 'Scrape web page',
				description: 'Render a page and return markdown, HTML, links, a screenshot or a PDF of it',
			},
			{
				name: 'Scrape Many',
				value: 'scrapeMany',
				action: 'Scrape many web pages',
				description: 'Render a list of pages in one run, up to 1000 at a time',
			},
		],
	},
	...scrapeFields,
	...scrapeManyFields,
	...extractFields,
];
