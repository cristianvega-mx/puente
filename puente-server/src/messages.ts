import * as z from 'zod/v4';
import { generateStructured } from './bedrock.js';
import { family, type Child, type Notice } from './data.js';

export const draftSchema = z.object({
  subject: z.string().describe('Short email subject in English.'),
  body: z
    .string()
    .describe(
      "The email in English: greeting with the teacher's name, two to four short sentences, and a polite closing " +
        "signed with the parent's name. Say only what the parent said; no promises or details they did not give."
    ),
  backTranslation: z
    .string()
    .describe("A faithful translation of the English body into the parent's language, so they can check it before saving.")
});

export type Draft = z.output<typeof draftSchema> & {
  childId: string;
  teacherName: string;
  teacherEmail: string;
};

export type SavedDraft = Draft & { id: string; savedAt: string };

export const drafts: SavedDraft[] = [];

const system = [
  "You write short emails from an immigrant parent to their child's teacher in the United States.",
  'The parent tells you in Spanish what they want to say. Write clear, warm, polite American English',
  'that a busy teacher can read in ten seconds.',
  'Keep every fact the parent gave (dates, reasons, questions) and add nothing else.'
].join(' ');

export function writeDraft(child: Child, parentWords: string, notice?: Notice): Promise<z.output<typeof draftSchema>> {
  const prompt = [
    `Parent: ${family.parentName}. Parent's language: ${family.parentLanguage}.`,
    `Child: ${child.name} (${child.grade}, ${child.school}). Teacher: ${child.teacher.name}.`,
    notice ? `The message is about this school notice: "${notice.subject}" (received ${notice.receivedAt}).` : '',
    '',
    `What the parent wants to say: ${parentWords}`
  ].join('\n');
  return generateStructured({
    system,
    prompt,
    toolName: 'record_email_draft',
    toolDescription: 'Record the email draft and its back-translation.',
    schema: draftSchema
  });
}

export function saveDraft(draft: Draft): SavedDraft {
  const saved = { ...draft, id: `d-${String(drafts.length + 1).padStart(3, '0')}`, savedAt: new Date().toISOString() };
  drafts.push(saved);
  return saved;
}

export function mailtoLink(draft: Draft): string {
  const query = new URLSearchParams({ subject: draft.subject, body: draft.body }).toString().replace(/\+/g, '%20');
  return `mailto:${draft.teacherEmail}?${query}`;
}
