import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type {
	CreateMessageRequestParamsBase,
	CreateMessageResult,
} from "@modelcontextprotocol/sdk/types.js";
import type {
	Elicit,
	RootInfo,
	Sample,
	SampleOptions,
	Session,
	ToolContext,
} from "./types.js";

export function createElicit(sdkServer: Server): Elicit {
	return {
		async form({ message, schema }) {
			const r = await sdkServer.elicitInput({
				message,
				// biome-ignore lint/suspicious/noExplicitAny: SDK's PrimitiveSchemaDefinition union is too narrow for our simplified schema type
				requestedSchema: { type: "object", properties: schema as any },
			});
			return {
				action: r.action,
				content: (r.content ?? {}) as Record<
					string,
					string | number | boolean | string[]
				>,
			};
		},
		async url({ message, url }) {
			const r = await sdkServer.elicitInput({
				mode: "url",
				message,
				url,
				elicitationId: crypto.randomUUID(),
			});
			return { action: r.action };
		},
	};
}

export function createRootsAccessor(
	sdkServer: Server,
): () => Promise<RootInfo[]> {
	return async () => {
		try {
			const result = await sdkServer.listRoots();
			return result.roots.map((r) => {
				const info: RootInfo = { uri: r.uri };
				if (r.name !== undefined) info.name = r.name;
				return info;
			});
		} catch {
			return [];
		}
	};
}

export function createSample(sdkServer: Server): Sample {
	async function sample(
		prompt: string,
		options?: SampleOptions,
	): Promise<string> {
		const params: CreateMessageRequestParamsBase = {
			messages: [{ role: "user", content: { type: "text", text: prompt } }],
			maxTokens: options?.maxTokens ?? 1024,
		};
		if (options?.model !== undefined)
			params.modelPreferences = { hints: [{ name: options.model }] };
		if (options?.system !== undefined) params.systemPrompt = options.system;
		if (options?.temperature !== undefined)
			params.temperature = options.temperature;
		if (options?.stopSequences !== undefined)
			params.stopSequences = options.stopSequences;

		const result = await sdkServer.createMessage(params);
		const content = result.content;
		if (content.type === "text") return content.text;
		return "";
	}

	async function raw(
		params: CreateMessageRequestParamsBase,
	): Promise<CreateMessageResult> {
		return sdkServer.createMessage(params);
	}

	return Object.assign(sample, { raw });
}

export function createToolContext(
	sdkServer: Server,
	sessionId: string,
	session: Session,
	name: string,
	signal: AbortSignal,
): ToolContext {
	return {
		toolName: name,
		session,
		signal,
		sessionId,
		elicit: createElicit(sdkServer),
		roots: createRootsAccessor(sdkServer),
		sample: createSample(sdkServer),
	};
}
