import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { DocumentType } from '@smithy/types';
import * as z from 'zod/v4';

// Authenticates with the Bedrock API key in AWS_BEARER_TOKEN_BEDROCK (or any standard AWS credentials).
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const modelId = process.env.BEDROCK_MODEL_ID ?? 'us.amazon.nova-pro-v1:0';

type StructuredRequest<T extends z.ZodType> = {
  system: string;
  prompt: string;
  toolName: string;
  toolDescription: string;
  schema: T;
  maxTokens?: number;
};

// Gets JSON of a known shape from the model: the shape is offered as the only tool and the
// model is required to call it, so Bedrock returns the tool input instead of free text.
export async function generateStructured<T extends z.ZodType>(request: StructuredRequest<T>): Promise<z.output<T>> {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(request.schema, { io: 'input' }) as Record<string, unknown>;
  const response = await client.send(
    new ConverseCommand({
      modelId,
      system: [{ text: request.system }],
      messages: [{ role: 'user', content: [{ text: request.prompt }] }],
      inferenceConfig: { maxTokens: request.maxTokens ?? 2000, temperature: 0 },
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: request.toolName,
              description: request.toolDescription,
              inputSchema: { json: jsonSchema as DocumentType }
            }
          }
        ],
        toolChoice: { tool: { name: request.toolName } }
      }
    })
  );
  const toolUse = response.output?.message?.content?.find(block => block.toolUse)?.toolUse;
  if (!toolUse) throw new Error(`The model did not return ${request.toolName} (stop reason: ${response.stopReason}).`);
  return request.schema.parse(toolUse.input);
}
