// Connects to a running Puente server the way an MCP host would and exercises each tool once.
// The elicitation handler plays the parent: it accepts the form with its default answers.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const url = new URL(process.env.PUENTE_URL ?? 'http://127.0.0.1:3000/mcp');
// 'auto' negotiates protocol 2026-07-28, where the server asks for input with input_required results.
const client = new Client(
  { name: 'puente-smoke-test', version: '0.2.0' },
  { capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: 'auto' } }
);

client.setRequestHandler('elicitation/create', async request => {
  const params = request.params as { message: string; requestedSchema?: { properties?: Record<string, { default?: unknown }> } };
  console.log('Form shown to the parent:', params.message);
  const content = Object.fromEntries(
    Object.entries(params.requestedSchema?.properties ?? {}).map(([name, field]) => [name, field.default])
  ) as Record<string, string | number | boolean | string[]>;
  console.log('Parent answers:', JSON.stringify(content));
  return { action: 'accept', content };
});

const transport = new StreamableHTTPClientTransport(url);
await client.connect(transport);

const { tools } = await client.listTools();
console.log('Tools:', tools.map(tool => tool.name).join(', '));

const unread = await client.callTool({ name: 'list_notices', arguments: { child: 'Sofía', unreadOnly: true } });
console.log('Unread for Sofía:', (unread.structuredContent as { notices: unknown[] }).notices.length);

const notice = await client.callTool({ name: 'get_notice', arguments: { id: 'n-001' } });
console.log('Opened:', (notice.structuredContent as { subject: string }).subject);

const unknown = await client.callTool({ name: 'list_notices', arguments: { child: 'Lucía' } });
console.log('Unknown child is an error result:', unknown.isError === true);

const explained = await client.callTool({ name: 'explain_notice', arguments: { id: 'n-002' } });
const explanation = explained.structuredContent as { spoken: string; events: unknown[]; glossary: { term: string }[] };
console.log('Alexa says:', explanation.spoken);
console.log('Dates found:', explanation.events.length, '| glossary:', explanation.glossary.map(entry => entry.term).join(', '));

const saved = await client.callTool({ name: 'add_to_calendar', arguments: { noticeId: 'n-002' } });
console.log(saved.content.find(block => block.type === 'text')?.text);

const upcoming = await client.callTool({ name: 'list_upcoming', arguments: { days: 30 } });
console.log('Upcoming entries:', (upcoming.structuredContent as { entries: unknown[] }).entries.length);

const ics = await client.readResource({ uri: 'puente://family/calendar.ics' });
const icsText = (ics.contents[0] as { text: string }).text;
console.log('calendar.ics events:', icsText.match(/BEGIN:VEVENT/g)?.length ?? 0);

const profile = await client.readResource({ uri: 'puente://family/profile' });
console.log('Family resource bytes:', JSON.stringify(profile.contents[0]).length);

try {
  await transport.terminateSession();
} catch {
  // Stateless servers have no session to end.
}
await client.close();
