// Jours calendaires ('YYYY-MM-DD') dans le fuseau horaire d'un pays : les API de
// production découpent leurs fenêtres à minuit heure locale.

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const hourFormats = new Map<string, Intl.DateTimeFormat>();

function dateFormat(timeZone: string) {
  let format = dateFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dateFormats.set(timeZone, format);
  }
  return format;
}

function hourFormat(timeZone: string) {
  let format = hourFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' });
    hourFormats.set(timeZone, format);
  }
  return format;
}

export function dayIn(timeZone: string, date: Date = new Date()): string {
  return dateFormat(timeZone).format(date);
}

export function hourIn(timeZone: string, date: Date = new Date()): number {
  return Number(hourFormat(timeZone).format(date));
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Minuit local avec son décalage, ex. "2026-10-25T00:00:00+02:00" pour Europe/Paris. */
export function midnightIn(timeZone: string, day: string): string {
  // Décalages possibles autour de ce jour (changement d'heure compris)
  const probe = Date.parse(`${day}T12:00:00Z`);
  const offsets = new Set<string>();
  for (const delta of [-36, -12, 0, 12]) {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(probe + delta * 3_600_000))
      .find((part) => part.type === 'timeZoneName')?.value;
    offsets.add(name === 'GMT' || !name ? '+00:00' : name.replace('GMT', ''));
  }
  for (const offset of offsets) {
    const iso = `${day}T00:00:00${offset}`;
    const date = new Date(iso);
    if (dayIn(timeZone, date) === day && hourIn(timeZone, date) === 0) return iso;
  }
  throw new Error(`Impossible de déterminer minuit (${timeZone}) pour ${day}`);
}
