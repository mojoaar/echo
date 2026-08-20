const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface AdminDateRange {
  from: number;
  to: number;
}

function timeZone(): string {
  const configured = process.env.TZ?.trim();
  if (!configured) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: configured }).format();
    return configured;
  } catch {
    return 'UTC';
  }
}

function dateParts(timestamp: number): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const values = new Map(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return {
    year: values.get('year') ?? 0,
    month: values.get('month') ?? 0,
    day: values.get('day') ?? 0,
    hour: values.get('hour') ?? 0,
    minute: values.get('minute') ?? 0,
    second: values.get('second') ?? 0,
  };
}

function dateValue(parts: Pick<DateParts, 'year' | 'month' | 'day'>): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function parseDateValue(value: string | null): string | null {
  if (!value || !DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : null;
}

function shiftDate(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return dateValue({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() });
}

function dateDifference(from: string, to: string): number {
  const fromParts = from.split('-').map(Number);
  const toParts = to.split('-').map(Number);
  return (Date.UTC(toParts[0], toParts[1] - 1, toParts[2]) - Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2])) / DAY_MS;
}

function localMidnight(value: string): number | null {
  const [year, month, day] = value.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const offsets = new Set<number>();
  for (const delta of [-2, -1, 0, 1, 2]) {
    const timestamp = target + delta * DAY_MS;
    const parts = dateParts(timestamp);
    offsets.add(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - timestamp);
  }

  const candidates = [...offsets]
    .map((offset) => target - offset)
    .filter((timestamp) => dateValue(dateParts(timestamp)) >= value)
    .sort((left, right) => left - right);
  return candidates[0] ?? null;
}

export function containerDate(timestamp = Date.now()): string {
  return dateValue(dateParts(timestamp));
}

export function adminDateRange(url: URL, maxDays: number): AdminDateRange | null {
  const now = Date.now();
  const today = containerDate(now);
  const earliest = shiftDate(today, -maxDays);
  const fromValue = url.searchParams.get('from');
  const toValue = url.searchParams.get('to');
  const fromDate = parseDateValue(fromValue) ?? (fromValue === null ? earliest : null);
  const toDate = parseDateValue(toValue) ?? (toValue === null ? today : null);
  if (!fromDate || !toDate || fromDate < earliest || fromDate > today || toDate > today || fromDate > toDate || dateDifference(fromDate, toDate) > maxDays) return null;

  const from = localMidnight(fromDate);
  const end = localMidnight(shiftDate(toDate, 1));
  if (from === null || end === null) return null;
  const to = toValue === null ? now : Math.min(end - 1, now);
  return { from, to };
}
