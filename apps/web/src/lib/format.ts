const dateTime = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/** Local calendar date as YYYY-MM-DD (what date inputs and the URL use). */
export function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const startOfDayIso = (ymd: string) => new Date(`${ymd}T00:00:00`).toISOString();
export const endOfDayIso = (ymd: string) => new Date(`${ymd}T23:59:59.999`).toISOString();
