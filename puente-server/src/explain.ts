import * as z from 'zod/v4';
import { generateStructured } from './bedrock.js';
import { sayDate } from './calendar.js';
import { childById, family, type Notice } from './data.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const clockTime = z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM');

export const eventSchema = z.object({
  title: z.string().describe("Short calendar title in the parent's language that starts with the child's first name."),
  date: isoDate,
  startTime: clockTime.optional().describe('Only when the notice gives a time.'),
  endTime: clockTime.optional().describe('Only when the notice gives an end time.'),
  kind: z.enum(['event', 'deadline']).describe('event: something happens that day. deadline: last day to do something.')
});

export const costSchema = z.object({ what: z.string(), amountUsd: z.number() });

export const actionSchema = z.object({
  what: z.string().describe("A task for the parent, in their language, starting with a verb."),
  by: isoDate.optional().describe('Only when the notice ties this task to a deadline.')
});

export const explanationSchema = z.object({
  summary: z
    .string()
    .describe(
      "At most three short sentences (under 60 words) in the parent's language, written by Puente to the parent: " +
        'what will happen to the child, and what the parent must do and by when. Explain; do not translate the notice.'
    ),
  spoken: z
    .string()
    .describe(
      'What Alexa says out loud to the parent, under 35 words: starts with the child\'s name (for example "Sofía tiene…"), ' +
        'gives the key fact with its date, then the task with the earliest deadline and that deadline. ' +
        'No URLs, codes or phone numbers.'
    ),
  urgency: z
    .enum(['high', 'medium', 'low'])
    .describe('high: something is due within 7 days of the notice or the child could miss school. low: information only.'),
  events: z
    .array(eventSchema)
    .describe(
      'Every event date and every deadline in the notice (for example the last day to return a form, pay or order). ' +
        'A deadline title says what is due.'
    ),
  costs: z
    .array(costSchema)
    .describe('Amounts the family may have to pay. Leave out anything free.')
    .transform(costs => costs.filter(cost => cost.amountUsd > 0)),
  actions: z.array(actionSchema).describe('What the parent has to do, earliest deadline first. Optional tasks say so.')
});

export type Explanation = z.output<typeof explanationSchema>;

const system = [
  "You help immigrant parents in the United States understand notices from their children's schools.",
  'Write for a parent who reads Spanish and little English: Mexican Spanish, plain words, short sentences,',
  'a warm tone, and "usted" for the parent.',
  'Use only facts stated in the notice. Never invent dates, deadlines, amounts, links or requirements,',
  'and never add medical, legal or financial facts the notice does not state.',
  'Resolve dates to YYYY-MM-DD using the year the notice was received; a month earlier than that means the next year.',
  'In summary and spoken, write every date as the token {YYYY-MM-DD}, braces included (for example "el {2026-10-08}");',
  'Puente turns each token into the spoken date with its weekday, so never write weekday or month names yourself.',
  'Say "excursión" for field trip and "permiso" for permission slip.',
  'Keep names of people, schools, portals and apps as written.'
].join(' ');

const dateToken = /\{(\d{4}-\d{2}-\d{2})\}/g;
const cache = new Map<string, Promise<Explanation>>();

// One Bedrock call per notice; later calls (and retries of the same tool call) reuse it.
export function explainNotice(notice: Notice): Promise<Explanation> {
  let explanation = cache.get(notice.id);
  if (!explanation) {
    explanation = requestExplanation(notice);
    explanation.catch(() => cache.delete(notice.id));
    cache.set(notice.id, explanation);
  }
  return explanation;
}

async function requestExplanation(notice: Notice): Promise<Explanation> {
  const child = childById(notice.childId);
  const prompt = [
    `Parent's language: ${family.parentLanguage}.`,
    `Child: ${child?.name} (${child?.grade}, ${child?.school}).`,
    `Received: ${notice.receivedAt}. From: ${notice.from}.`,
    `Subject: ${notice.subject}`,
    '',
    notice.body
  ].join('\n');
  const ask = () =>
    generateStructured({
      system,
      prompt,
      toolName: 'record_explanation',
      toolDescription: 'Record the explanation of the school notice for the parent.',
      schema: explanationSchema
    });

  // The model sometimes leaves the first deadline out of what Alexa says; one retry fixes it most of the time.
  let draft = await ask();
  if (!mentionsFirstDeadline(draft)) draft = await ask();
  return finish(draft, child?.name ?? '');
}

function firstDeadline(explanation: Explanation): string | undefined {
  return explanation.actions
    .map(action => action.by)
    .filter((by): by is string => Boolean(by))
    .sort()[0];
}

function mentionsFirstDeadline(explanation: Explanation): boolean {
  const deadline = firstDeadline(explanation);
  return !deadline || explanation.spoken.includes(`{${deadline}}`);
}

// Fixes what the model is least reliable at: weekdays, and deadlines that only appear as tasks.
function finish(explanation: Explanation, childName: string): Explanation {
  const events = [...explanation.events];
  for (const action of explanation.actions) {
    if (action.by && !events.some(event => event.date === action.by && event.kind === 'deadline')) {
      events.push({ title: `${childName}: ${action.what.replace(/\.$/, '')}`, date: action.by, kind: 'deadline' });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  const say = (text: string) => text.replace(dateToken, (_token, date: string) => sayDate(date));
  return { ...explanation, summary: say(explanation.summary), spoken: say(explanation.spoken), events };
}
