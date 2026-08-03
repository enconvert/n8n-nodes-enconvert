import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class EnconvertApi implements ICredentialType {
	name = 'enconvertApi';

	displayName = 'EnConvert API';

	icon: Icon = { light: 'file:../icons/enconvert.svg', dark: 'file:../icons/enconvert.dark.svg' };

	documentationUrl = 'https://www.enconvert.com/docs/introduction';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'e.g. sk_live_...',
			description:
				'Private API key from your EnConvert dashboard. Public keys starting with "pk_" are browser-only and will be rejected.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.enconvert.com',
			placeholder: 'e.g. https://api.enconvert.com',
			description: 'Change this only if you were given a different EnConvert endpoint',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v1/whoami',
			method: 'GET',
		},
	};
}
