// Checks that the Bedrock API key in .env works: one short Converse call, prints the reply.
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const modelId = process.env.BEDROCK_MODEL_ID ?? 'us.amazon.nova-pro-v1:0';
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

const response = await client.send(
  new ConverseCommand({
    modelId,
    messages: [{ role: 'user', content: [{ text: 'Responde solo con: "Puente listo".' }] }],
    inferenceConfig: { maxTokens: 20 }
  })
);

console.log('Model:', modelId);
console.log('Reply:', response.output?.message?.content?.[0]?.text);
console.log('Tokens:', response.usage);
