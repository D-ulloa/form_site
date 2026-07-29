function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function computeFormattedStart(startDate: unknown): string {
  if (typeof startDate !== 'string') return '';
  const parts = parseIsoDate(startDate);
  return parts
    ? toIsoDate(new Date(Date.UTC(parts.year, parts.month - 1, 0)))
    : '';
}

export function computeFormattedUpdate(
  formattedStart: unknown,
  updateMonths: unknown,
): string {
  if (typeof formattedStart !== 'string' || formattedStart === '') return '';
  const parts = parseIsoDate(formattedStart);
  if (!parts || updateMonths === '' || updateMonths === null || updateMonths === undefined) return '';
  const months = typeof updateMonths === 'number' ? updateMonths : Number(updateMonths);
  if (!Number.isSafeInteger(months) || months < 0) return '';
  return toIsoDate(new Date(Date.UTC(
    parts.year,
    parts.month - 1 + months + 1,
    0,
  )));
}
