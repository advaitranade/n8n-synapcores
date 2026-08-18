import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

// SynapCores' REST API documents an X-API-Key header scheme (per
// docs.synapcores.com/api-reference), created via POST /v1/api-keys or the
// web console. Testing against a real CE instance (v1.14.3-ce) found the
// documented X-API-Key header returns {"error":"missing_authorization"} for
// every key tried (freshly-created via API, and via the web console) --
// but "Authorization: ApiKey <key>" works correctly for the same request.
// The documented header name/scheme appears to be wrong; this is the format
// that actually works. Reported upstream.
export class SynapCoresApi implements ICredentialType {
	name = 'synapCoresApi';

	displayName = 'SynapCores API';

	icon: Icon = 'file:../nodes/SynapCores/synapcores.svg';

	documentationUrl = 'https://docs.synapcores.com/api-reference/';

	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: 'http://127.0.0.1:8080',
			placeholder: 'http://127.0.0.1:8080',
			description:
				'Base URL of your SynapCores instance, including protocol and port. ' +
				'The REST API and gateway share the same port (default 8080).',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Created via POST /v1/api-keys or the web console (Settings -> API Keys). ' +
				'Sent as "Authorization: ApiKey <key>" -- NOT the X-API-Key header the docs ' +
				'describe, which was found to return missing_authorization in testing.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=ApiKey {{$credentials.apiKey}}',
			},
		},
	};

	// A lightweight, always-available route to validate the credential:
	// /v1/schema/tables just lists tables, so it's a safe read-only check
	// that also confirms the API key actually has access.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.host}}',
			url: '/v1/schema/tables',
			method: 'GET',
		},
	};
}
