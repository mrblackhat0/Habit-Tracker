export const formatTime = (date?: string) => {
  if (!date) return null;
  let d = new Date(date)
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const SMALL_WORDS = new Set(['a','an','the','and','but','or','for','nor','on','at','to','from','by','in','of','with','as','is','if','vs','via']);
export const toTitleCase = (str: string) => {
  if (!str) return str;
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i !== 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
};

