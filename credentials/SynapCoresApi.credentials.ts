import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

// SynapCores' REST API documents two auth schemes (per docs.synapcores.com/api-reference):
//   1. Bearer JWT, obtained via POST /v1/auth/login (email + password)
//   2. X-API-Key header, created via POST /v1/api-keys
//
// We originally used the API key scheme (simpler, no expiry to manage), but
// testing against a real CE instance found X-API-Key returns
// {"error":"missing_authorization"} even with a freshly-created, valid key --
// while the exact same request with a Bearer JWT succeeds. This looks like a
// genuine gap between the documented API and this build (worth reporting
// upstream). Using Bearer JWT here since it's the scheme that actually works.
//
// Practical implication: paste a JWT (from POST /v1/auth/login) into the
// "Bearer Token" field below, not an aidb_... API key. JWTs expire (24h by
// default per gateway.toml's token_expiration) so this will need refreshing
// periodically until/unless the API key path is fixed upstream.
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
			displayName: 'Bearer Token',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'A JWT from POST /v1/auth/login (NOT an aidb_... API key -- X-API-Key auth was ' +
				'found to be non-functional against this build; see credential file comments). ' +
				'JWTs expire (24h default) and will need periodic refreshing.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// A lightweight, always-available route to validate the credential:
	// /v1/schema/tables just lists tables, so it's a safe read-only check
	// that also confirms the token actually has access.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.host}}',
			url: '/v1/schema/tables',
			method: 'GET',
		},
	};
}
