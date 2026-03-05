import { z } from "zod";

/** Convert a Zod raw shape to a JSON Schema object suitable for MCP tool inputSchema. */
export function zodToJsonSchema(shape: z.ZodRawShape): {
	type: "object";
	properties: Record<string, unknown>;
	required?: string[];
} {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const [key, schema] of Object.entries(shape)) {
		properties[key] = zodTypeToJsonSchema(schema);
		if (!schema.isOptional()) {
			required.push(key);
		}
	}

	const result: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
	} = {
		type: "object",
		properties,
	};

	if (required.length > 0) {
		result.required = required;
	}

	return result;
}

function zodTypeToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
	// Unwrap optional/nullable
	if (schema instanceof z.ZodOptional) {
		return zodTypeToJsonSchema(schema.unwrap());
	}
	if (schema instanceof z.ZodNullable) {
		const inner = zodTypeToJsonSchema(schema.unwrap());
		return { ...inner, nullable: true };
	}

	if (schema instanceof z.ZodString) {
		return { type: "string" };
	}
	if (schema instanceof z.ZodNumber) {
		return { type: "number" };
	}
	if (schema instanceof z.ZodBoolean) {
		return { type: "boolean" };
	}
	if (schema instanceof z.ZodArray) {
		return {
			type: "array",
			items: zodTypeToJsonSchema(schema.element),
		};
	}
	if (schema instanceof z.ZodEnum) {
		return {
			type: "string",
			enum: schema.options,
		};
	}
	if (schema instanceof z.ZodObject) {
		return zodToJsonSchema(schema.shape);
	}
	if (schema instanceof z.ZodDefault) {
		const inner = zodTypeToJsonSchema(schema._def.innerType);
		return { ...inner, default: schema._def.defaultValue() };
	}

	// Fallback
	return {};
}
