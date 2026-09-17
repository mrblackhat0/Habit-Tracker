// utils/dates.ts

const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function parseOccurrence(occurrence: string | null | undefined): number[] {
  if (!occurrence || typeof occurrence !== 'string') return [];
  // handle legacy "daily" value
  if (occurrence.trim().toLowerCase() === 'daily') return [0, 1, 2, 3, 4, 5, 6];
  return occurrence
    .split(',')
    .map((d) => DAY_MAP[d.trim()])
    .filter((d): d is number => typeof d === 'number');
}

export function isScheduledDay(dateStr: string, scheduledDays: number[]): boolean {
  if (!scheduledDays || scheduledDays.length === 0) return false;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  return scheduledDays.includes(d.getDay());
}

export function getTodayDateStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPrevDateStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextDateStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNextScheduledDateStr(dateStr: string, scheduledDays: number[]): string {
  let cur = getNextDateStr(dateStr);
  while (!isScheduledDay(cur, scheduledDays)) {
    cur = getNextDateStr(cur);
  }
  return cur;
}
