import { createServer } from 'node:http';
import { acceptedContent, createMcpHandler, inputRequired, inputResponse, McpServer } from '@modelcontextprotocol/server';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import { addDays, addEntries, calendar, today, toICalendar, type CalendarEntry } from './calendar.js';
import { childById, family, notices, resolveChild } from './data.js';
import { actionSchema, costSchema, eventSchema, explainNotice } from './explain.js';
import { glossaryFor } from './glossary.js';

const calendarUri = 'puente://family/calendar.ics';

const noticeSummary = z.object({
  id: z.string(),
  childId: z.string(),
  childName: z.string(),
  school: z.string(),
  from: z.string(),
  subject: z.string(),
  receivedAt: z.string(),
  read: z.boolean()
});

const noticeFull = noticeSummary.extend({
  body: z.string(),
  language: z.string(),
  teacherName: z.string(),
  teacherEmail: z.string()
});

const explanationOutput = z.object({
  noticeId: z.string(),
  childName: z.string(),
  subject: z.string(),
  summary: z.string(),
  spoken: z.string(),
  urgency: z.enum(['high', 'medium', 'low']),
  events: z.array(eventSchema),
  costs: z.array(costSchema),
  actions: z.array(actionSchema),
  glossary: z.array(z.object({ term: z.string(), meaning: z.string() }))
});

const calendarEntry = z.object({
  id: z.string(),
  childId: z.string(),
  noticeId: z.string(),
  title: z.string(),
  date: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  kind: z.enum(['event', 'deadline']),
  remindDayBefore: z.boolean()
});

const dateChoice = z.object({ dates: z.array(z.string()), remindDayBefore: z.boolean().optional() });

function findNotice(id: string) {
  const notice = notices.find(candidate => candidate.id === id);
  if (!notice) throw new Error(`No notice with id "${id}". Call list_notices to see valid ids.`);
  return notice;
}

// "jueves, 15 de octubre" — how the parent reads a date.
function spanishDay(date: string): string {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`)
  );
}

function summarize(notice: (typeof notices)[number]) {
  const child = childById(notice.childId);
  return {
    id: notice.id,
    childId: notice.childId,
    childName: child?.name ?? notice.childId,
    school: child?.school ?? '',
    from: notice.from,
    subject: notice.subject,
    receivedAt: notice.receivedAt,
    read: notice.read
  };
}

function buildServer(): McpServer {
  const server = new McpServer({ name: 'puente', version: '0.2.0' });

  server.registerTool(
    'list_notices',
    {
      title: 'List school notices',
      description:
        "List the notices the family received from their children's schools, newest first. " +
        'Use it when a parent asks what the school sent, whether there is anything new, or about a specific child.',
      inputSchema: z.object({
        child: z
          .string()
          .optional()
          .describe('Child name or id, for example "Sofía" or "mateo". Omit to list notices for every child.'),
        unreadOnly: z.boolean().optional().describe('Only return notices the parent has not opened yet.')
      }),
      outputSchema: z.object({ notices: z.array(noticeSummary) })
    },
    async ({ child, unreadOnly }) => {
      let selected = notices;
      if (child) {
        const match = resolveChild(child);
        if (!match) {
          const names = family.children.map(c => c.name).join(', ');
          throw new Error(`No child named "${child}". This family's children are: ${names}.`);
        }
        selected = selected.filter(notice => notice.childId === match.id);
      }
      if (unreadOnly) selected = selected.filter(notice => !notice.read);
      const output = {
        notices: [...selected].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).map(summarize)
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'get_notice',
    {
      title: 'Read a school notice',
      description:
        'Return the full original text of one school notice, in English, plus the teacher contact for that child. ' +
        'Marks the notice as read.',
      inputSchema: z.object({ id: z.string().describe('Notice id returned by list_notices, for example "n-002".') }),
      outputSchema: noticeFull
    },
    async ({ id }) => {
      const notice = findNotice(id);
      notice.read = true;
      const child = childById(notice.childId);
      const output = {
        ...summarize(notice),
        body: notice.body,
        language: notice.language,
        teacherName: child?.teacher.name ?? '',
        teacherEmail: child?.teacher.email ?? ''
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'explain_notice',
    {
      title: 'Explain a school notice',
      description:
        "Explain one school notice in the parent's language: what will happen, the dates, the costs and what the parent " +
        'must do. Use it when the parent asks what a notice says or what they have to do. Say `spoken` out loud and show ' +
        '`summary` on screen. Marks the notice as read.',
      inputSchema: z.object({ id: z.string().describe('Notice id returned by list_notices, for example "n-002".') }),
      outputSchema: explanationOutput
    },
    async ({ id }) => {
      const notice = findNotice(id);
      const explanation = await explainNotice(notice);
      notice.read = true;
      const output = {
        noticeId: notice.id,
        childName: childById(notice.childId)?.name ?? notice.childId,
        subject: notice.subject,
        ...explanation,
        glossary: glossaryFor(`${notice.subject} ${notice.body}`)
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'add_to_calendar',
    {
      title: 'Add school dates to the family calendar',
      description:
        'Put the dates from one school notice on the family calendar. Before saving, the parent sees a form to choose ' +
        'which dates to keep and whether to get a reminder the day before; nothing is saved if they decline.',
      inputSchema: z.object({ noticeId: z.string().describe('Notice id, for example "n-002".') }),
      outputSchema: z.object({
        added: z.array(calendarEntry),
        alreadyOnCalendar: z.number().int(),
        calendarUri: z.string()
      })
    },
    async ({ noticeId }, ctx) => {
      const notice = findNotice(noticeId);
      const { events } = await explainNotice(notice);
      const candidates = events.map((event, index) => ({
        ...event,
        id: `${notice.id}-${index + 1}`,
        childId: notice.childId,
        noticeId: notice.id
      }));
      const nothing = (message: string) => {
        const output = { added: [], alreadyOnCalendar: 0, calendarUri };
        return { content: [{ type: 'text' as const, text: message }], structuredContent: output };
      };
      if (candidates.length === 0) return nothing('Este aviso no trae fechas para el calendario.');

      const answer = inputResponse(ctx.mcpReq.inputResponses, 'dates');
      if (answer.kind === 'missing') {
        return inputRequired({
          inputRequests: {
            dates: inputRequired.elicit({
              message: `¿Qué fechas del aviso "${notice.subject}" guardo en el calendario de la familia?`,
              requestedSchema: {
                type: 'object',
                properties: {
                  dates: {
                    type: 'array',
                    title: 'Fechas',
                    items: {
                      anyOf: candidates.map(candidate => ({
                        const: candidate.id,
                        title: `${spanishDay(candidate.date)}: ${candidate.title}`
                      }))
                    },
                    default: candidates.map(candidate => candidate.id)
                  },
                  remindDayBefore: { type: 'boolean', title: 'Recordarme un día antes', default: true }
                },
                required: ['dates']
              }
            })
          }
        });
      }
      if (answer.kind !== 'elicit' || answer.action !== 'accept') {
        return nothing('No guardé nada en el calendario.');
      }
      const choice = acceptedContent(ctx.mcpReq.inputResponses, 'dates', dateChoice);
      if (!choice) throw new Error('The date selection was not valid. Call add_to_calendar again.');

      const chosen: CalendarEntry[] = candidates
        .filter(candidate => choice.dates.includes(candidate.id))
        .map(candidate => ({ ...candidate, remindDayBefore: choice.remindDayBefore ?? true }));
      const added = addEntries(chosen);
      const output = { added, alreadyOnCalendar: chosen.length - added.length, calendarUri };
      const lines = added.map(entry => `• ${spanishDay(entry.date)}: ${entry.title}`);
      return {
        content: [
          {
            type: 'text',
            text: added.length > 0 ? `Guardé en el calendario:\n${lines.join('\n')}` : 'Esas fechas ya estaban en el calendario.'
          },
          { type: 'resource_link', uri: calendarUri, name: 'calendario-escuela.ics', mimeType: 'text/calendar' }
        ],
        structuredContent: output
      };
    }
  );

  server.registerTool(
    'list_upcoming',
    {
      title: 'Upcoming school dates',
      description:
        'List the school events and deadlines on the family calendar from today on. Use it when the parent asks what ' +
        'is coming up, for example "¿qué tenemos esta semana?".',
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).optional().describe('How many days ahead to look. Defaults to 14.'),
        child: z.string().optional().describe('Child name or id. Omit for the whole family.')
      }),
      outputSchema: z.object({ from: z.string(), to: z.string(), entries: z.array(calendarEntry) })
    },
    async ({ days, child }) => {
      const from = today();
      const to = addDays(from, days ?? 14);
      const match = child ? resolveChild(child) : undefined;
      if (child && !match) throw new Error(`No child named "${child}".`);
      const entries = calendar.filter(
        entry => entry.date >= from && entry.date <= to && (!match || entry.childId === match.id)
      );
      const output = { from, to, entries };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output
      };
    }
  );

  server.registerResource(
    'family-calendar',
    calendarUri,
    {
      title: 'Family school calendar',
      description: 'Every date the parent saved with add_to_calendar, as an iCalendar file any phone calendar can import.',
      mimeType: 'text/calendar'
    },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'text/calendar', text: toICalendar(calendar) }]
    })
  );

  server.registerResource(
    'family-profile',
    'puente://family/profile',
    {
      title: 'Family profile',
      description: "The family's children, their schools and teachers, and the parent's preferred language.",
      mimeType: 'application/json'
    },
    async uri => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(family) }]
    })
  );

  return server;
}

const handler = createMcpHandler(buildServer);
const nodeHandler = toNodeHandler(handler);
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();
const port = Number(process.env.PORT ?? 3000);

createServer((req, res) => {
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;
  void nodeHandler(req, res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Puente MCP server listening on http://127.0.0.1:${port}/mcp`);
});
