export const formatTime = (date?: string) => {
  if (!date) return null;
  let d = new Date(date);
  if (isNaN(d.getTime())) return null;

  let hours = d.getHours();
  let minutes = d.getMinutes();
  let ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  let hh = String(hours).padStart(2, '0');
  let mm = String(minutes).padStart(2, '0');

  return `${hh}:${mm} ${ampm}`;
};

const SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'for',
  'nor',
  'on',
  'at',
  'to',
  'from',
  'by',
  'in',
  'of',
  'with',
  'as',
  'is',
  'if',
  'vs',
  'via',
]);
export const toTitleCase = (str: string) => {
  if (!str) return str;
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i !== 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
};
