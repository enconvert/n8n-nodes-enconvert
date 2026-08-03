import type { INodeProperties } from 'n8n-workflow';

import { crawlFields } from './crawl';
import { mapFields } from './map';

const showOnlyForWebsite = { resource: ['website'] };

export const websiteDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForWebsite },
		default: 'map',
		options: [
			{
				name: 'Crawl',
				value: 'crawl',
				action: 'Crawl website into AI ready chunks',
				description:
					'Read a whole site and return passages ready to embed in a vector store, replacing a crawl, chunk and loop pipeline',
			},
			{
				name: 'Map',
				value: 'map',
				action: 'Map website links',
				description:
					'List the addresses on a site without rendering them, which is fast and uses no page allowance',
			},
		],
	},
	...mapFields,
	...crawlFields,
];
