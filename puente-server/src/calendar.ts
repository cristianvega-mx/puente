// The family calendar Puente writes to. In memory for the demo; exported as iCalendar
// so the parent can subscribe from any phone calendar.

export type CalendarEntry = {
  id: string;
  childId: string;
  noticeId: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  kind: 'event' | 'deadline';
  remindDayBefore: boolean;
};

export const calendar: CalendarEntry[] = [];

// Adds entries that are not on the calendar yet and returns the ones it added.
export function addEntries(entries: CalendarEntry[]): CalendarEntry[] {
  const added = entries.filter(entry => !calendar.some(existing => existing.id === entry.id));
  calendar.push(...added);
  calendar.sort((a, b) => `${a.date} ${a.startTime ?? ''}`.localeCompare(`${b.date} ${b.startTime ?? ''}`));
  return added;
}

// The demo can be pinned to a date with PUENTE_TODAY=YYYY-MM-DD so recordings stay stable.
export function today(): string {
  if (process.env.PUENTE_TODAY) return process.env.PUENTE_TODAY;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function toICalendar(entries: CalendarEntry[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Puente//School notices//ES',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Escuela (Puente)',
    'X-WR-TIMEZONE:America/Chicago'
  ];
  for (const entry of entries) {
    const day = entry.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${entry.id}@puente`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(entry.title)}`);
    if (entry.startTime) {
      const end = entry.endTime ?? entry.startTime;
      lines.push(
        `DTSTART;TZID=America/Chicago:${day}T${entry.startTime.replace(':', '')}00`,
        `DTEND;TZID=America/Chicago:${day}T${end.replace(':', '')}00`
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${addDays(entry.date, 1).replace(/-/g, '')}`);
    }
    if (entry.remindDayBefore) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(entry.title)}`, 'TRIGGER:-P1D', 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545 caps content lines at 75 octets; longer lines continue on lines that start with a space.
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(current + char, 'utf8') > limit) {
      parts.push(current);
      current = '';
    }
    current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
