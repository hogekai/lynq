import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type {
	CreateMessageRequestParamsBase,
	CreateMessageResult,
} from "@modelcontextprotocol/sdk/types.js";
import { inputToJsonSchema } from "./helpers.js";
import { error, image, json, text } from "./response.js";
import { createUserStore } from "./store.js";
import type {
	Elicit,
	ElicitUrlOptions,
	RootInfo,
	Sample,
	SampleOptions,
	Session,
	Store,
	ToolContext,
} from "./types.js";

export function createElicit(
	sdkServer: Server,
	registerElicitation?: (eid: string, srv: Server) => Promise<void>,
	cancelElicitation?: (eid: string) => void,
): Elicit {
	return {
		async form(message, schema) {
			const jsonSchema = inputToJsonSchema(schema);
			const r = await sdkServer.elicitInput({
				message,
				// biome-ignore lint/suspicious/noExplicitAny: SDK's PrimitiveSchemaDefinition union is too narrow for converted JSON Schema
				requestedSchema: jsonSchema as any,
			});
			return {
				action: r.action,
				// biome-ignore lint/suspicious/noExplicitAny: content shape is inferred from Zod schema via generics
				content: (r.content ?? {}) as any,
			};
		},
		async url(message, url, options?: ElicitUrlOptions) {
			const elicitationId = options?.elicitationId ?? crypto.randomUUID();

			// Register BEFORE sending to client to avoid race condition
			let completionPromise: Promise<void> | undefined;
			if (options?.waitForCompletion && registerElicitation) {
				completionPromise = registerElicitation(elicitationId, sdkServer);
			}

			const r = await sdkServer.elicitInput({
				mode: "url",
				message,
				url,
				elicitationId,
			});

			if (r.action === "accept" && completionPromise) {
				const timeoutMs = options?.timeout ?? 300_000;
				// biome-ignore lint/style/noNonNullAssertion: timer is always assigned synchronously inside the Promise executor before the await
				let timer: ReturnType<typeof setTimeout> = undefined!;
				const timeoutPromise = new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error("Elicitation timed out")),
						timeoutMs,
					);
				});
				try {
					await Promise.race([completionPromise, timeoutPromise]);
				} catch (err) {
					if (cancelElicitation) cancelElicitation(elicitationId);
					throw err;
				} finally {
					clearTimeout(timer);
				}
			} else if (completionPromise && cancelElicitation) {
				// Client declined/cancelled — clean up pending entry
				cancelElicitation(elicitationId);
			}

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
	args: Record<string, unknown>,
	signal: AbortSignal,
	store: Store,
	registerElicitation?: (eid: string, srv: Server) => Promise<void>,
	cancelElicitation?: (eid: string) => void,
): ToolContext {
	return {
		toolName: name,
		args,
		session,
		signal,
		sessionId,
		elicit: createElicit(sdkServer, registerElicitation, cancelElicitation),
		roots: createRootsAccessor(sdkServer),
		sample: createSample(sdkServer),
		text,
		json,
		error,
		image,
		store,
		userStore: createUserStore(session, store),
	};
}
