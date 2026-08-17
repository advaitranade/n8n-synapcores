import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	IHttpRequestMethods,
	IDataObject,
	IHttpRequestOptions,
} from 'n8n-workflow';

// One shared helper for every SynapCores API call. Keeps auth, base URL
// resolution, and JSON handling in a single place rather than repeated
// per-operation -- so if SynapCores changes the auth header or base path,
// there's exactly one function to update.
export async function synapCoresApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject | undefined = undefined,
	qs: IDataObject = {},
) {
	const credentials = await this.getCredentials('synapCoresApi');
	const host = (credentials.host as string).replace(/\/$/, ''); // strip trailing slash

	const options: IHttpRequestOptions = {
		method,
		url: `${host}${endpoint}`,
		body,
		qs,
		json: true,
	};

	return this.helpers.httpRequestWithAuthentication.call(this, 'synapCoresApi', options);
}
