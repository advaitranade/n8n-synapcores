import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { synapCoresApiRequest } from './transport';

export class SynapCores implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SynapCores',
		name: 'synapCores',
		icon: 'file:synapcores.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Query and manage a SynapCores AI-native database',
		defaults: {
			name: 'SynapCores',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'synapCoresApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'AI', value: 'ai' },
					{ name: 'Query', value: 'query' },
					{ name: 'Schema', value: 'schema' },
					{ name: 'Vector', value: 'vector' },
				],
				default: 'query',
			},

			// ---------- AI ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['ai'] } },
				options: [
					{
						name: 'Chat',
						value: 'chat',
						description: 'Send a message to SynapCores\' AI chat endpoint (POST /v1/ai/chat)',
						action: 'Send a chat message',
					},
				],
				default: 'chat',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				required: true,
				displayOptions: { show: { resource: ['ai'], operation: ['chat'] } },
			},
			{
				displayName: 'Session ID',
				name: 'sessionId',
				type: 'string',
				default: '',
				description: 'Optional. Reuses a SynapCores chat session for multi-turn continuity.',
				displayOptions: { show: { resource: ['ai'], operation: ['chat'] } },
			},
			{
				displayName: 'Database',
				name: 'database',
				type: 'string',
				default: '',
				description: 'Optional. Scopes the chat call to a specific SynapCores database.',
				displayOptions: { show: { resource: ['ai'], operation: ['chat'] } },
			},
			{
				displayName: 'Model Override (Experimental)',
				name: 'model',
				type: 'string',
				default: '',
				placeholder: 'e.g. claude-sonnet-4-6, gpt-5, ollama/qwen2.5-coder:7b',
				description:
					'NOT CONFIRMED SUPPORTED by SynapCores CE as of writing. This node sends it as an ' +
					'extra field on the request in case a future SynapCores version reads it; today it ' +
					'is most likely silently ignored server-side, since the model backend appears to be ' +
					'fixed at the gateway/instance level (see gateway.toml) rather than swappable per ' +
					'call. Leave blank unless you have confirmed your SynapCores instance honors this.',
				displayOptions: { show: { resource: ['ai'], operation: ['chat'] } },
			},
			{
				displayName: 'Model API Key (Experimental)',
				name: 'modelApiKey',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description:
					'NOT CONFIRMED SUPPORTED. A cloud-provider API key (OpenAI/Anthropic/etc.), sent ' +
					'alongside Model Override in case a future SynapCores version supports per-call ' +
					'provider credentials instead of a fixed gateway-level model. Currently speculative.',
				displayOptions: { show: { resource: ['ai'], operation: ['chat'] } },
			},

			// ---------- QUERY ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['query'] } },
				options: [
					{
						name: 'Execute',
						value: 'execute',
						description: 'Run a single SQL statement (POST /v1/query/execute)',
						action: 'Execute a SQL statement',
					},
					{
						name: 'Execute Batch',
						value: 'executeBatch',
						description: 'Run multiple SQL statements in one call (POST /v1/query/execute/batch)',
						action: 'Execute a batch of SQL statements',
					},
				],
				default: 'execute',
			},
			{
				displayName: 'SQL Statement',
				name: 'sql',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				placeholder: 'SELECT * FROM accounts WHERE health_status = $1',
				description:
					'The SQL statement to run. This is where CREATE AGENT, INSERT (to fire an ' +
					'ON INSERT-triggered agent), and ordinary SELECT/UPDATE statements all go.',
				displayOptions: { show: { resource: ['query'], operation: ['execute'] } },
			},
			{
				displayName: 'Parameters (JSON Array)',
				name: 'params',
				type: 'json',
				default: '[]',
				description: 'Positional parameters for the SQL statement, e.g. ["Lisbon", 3]',
				displayOptions: { show: { resource: ['query'], operation: ['execute'] } },
			},
			{
				displayName: 'SQL Statements (JSON Array)',
				name: 'statements',
				type: 'json',
				default: '[]',
				required: true,
				placeholder: '["INSERT INTO accounts (name) VALUES (\'Acme\')", "SELECT * FROM accounts"]',
				description: 'An array of SQL statements to run in order, in a single batch call',
				displayOptions: { show: { resource: ['query'], operation: ['executeBatch'] } },
			},

			// ---------- SCHEMA ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['schema'] } },
				options: [
					{
						name: 'List Tables',
						value: 'listTables',
						description: 'List all tables (GET /v1/schema/tables)',
						action: 'List tables',
					},
				],
				default: 'listTables',
			},

			// ---------- VECTOR ----------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['vector'] } },
				options: [
					{
						name: 'Search',
						value: 'search',
						description:
							'Similarity search against a vector collection ' +
							'(POST /v1/vectors/collections/{name}/search)',
						action: 'Search a vector collection',
					},
				],
				default: 'search',
			},
			{
				displayName: 'Collection Name',
				name: 'collection',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'destination_cost_benchmarks',
				displayOptions: { show: { resource: ['vector'], operation: ['search'] } },
			},
			{
				displayName: 'Query Text',
				name: 'queryText',
				type: 'string',
				default: '',
				required: true,
				description: 'Text to embed and search with',
				displayOptions: { show: { resource: ['vector'], operation: ['search'] } },
			},
			{
				displayName: 'Top K',
				name: 'topK',
				type: 'number',
				default: 5,
				description: 'Number of nearest results to return',
				displayOptions: { show: { resource: ['vector'], operation: ['search'] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject | IDataObject[] = {};

				if (resource === 'ai' && operation === 'chat') {
					const message = this.getNodeParameter('message', i) as string;
					const sessionId = this.getNodeParameter('sessionId', i) as string;
					const database = this.getNodeParameter('database', i) as string;
					const model = this.getNodeParameter('model', i) as string;
					const modelApiKey = this.getNodeParameter('modelApiKey', i) as string;

					const body: IDataObject = { message };
					if (sessionId) body.session_id = sessionId;
					if (database) body.database = database;
					// Sent speculatively -- see the field descriptions in the node UI.
					// SynapCores' documented AiChatRequest schema doesn't declare these,
					// so a compliant server should ignore them if unsupported (serde's
					// default behavior is to skip unknown JSON fields).
					if (model) body.model = model;
					if (modelApiKey) body.model_api_key = modelApiKey;

					responseData = (await synapCoresApiRequest.call(
						this,
						'POST',
						'/v1/ai/chat',
						body,
					)) as IDataObject;
				} else if (resource === 'query' && operation === 'execute') {
					const sql = this.getNodeParameter('sql', i) as string;
					const paramsRaw = this.getNodeParameter('params', i) as string;
					const params = paramsRaw ? JSON.parse(paramsRaw) : [];

					responseData = (await synapCoresApiRequest.call(
						this,
						'POST',
						'/v1/query/execute',
						{ sql, params },
					)) as IDataObject;
				} else if (resource === 'query' && operation === 'executeBatch') {
					const statementsRaw = this.getNodeParameter('statements', i) as string;
					const statements = JSON.parse(statementsRaw);

					responseData = (await synapCoresApiRequest.call(
						this,
						'POST',
						'/v1/query/execute/batch',
						{ statements },
					)) as IDataObject;
				} else if (resource === 'schema' && operation === 'listTables') {
					responseData = (await synapCoresApiRequest.call(
						this,
						'GET',
						'/v1/schema/tables',
					)) as IDataObject;
				} else if (resource === 'vector' && operation === 'search') {
					const collection = this.getNodeParameter('collection', i) as string;
					const queryText = this.getNodeParameter('queryText', i) as string;
					const topK = this.getNodeParameter('topK', i) as number;

					responseData = (await synapCoresApiRequest.call(
						this,
						'POST',
						`/v1/vectors/collections/${encodeURIComponent(collection)}/search`,
						{ query: queryText, top_k: topK },
					)) as IDataObject;
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported resource/operation combination: ${resource}/${operation}`,
						{ itemIndex: i },
					);
				}

				if (Array.isArray(responseData)) {
					returnData.push(
						...responseData.map((json) => ({ json, pairedItem: { item: i } })),
					);
				} else {
					returnData.push({ json: responseData, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// SynapCores errors come back as HTTP error responses from the API
				// (bad SQL, auth failure, unknown collection, etc.) -- NodeApiError
				// gives the user a properly formatted, actionable error in the n8n UI,
				// rather than a raw stack trace.
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
