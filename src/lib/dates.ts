// Shared date formatting utilities.
// All formatters guard against invalid dates (new Date("garbage") doesn't throw —
// it produces an Invalid Date that would otherwise stringify into the UI).

const ordinalSuffix = (d: number): string => {
  if (d > 3 && d < 21) return 'th';
  switch (d % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
};

// Long form, e.g. "9th June 2026"
export const formatDate = (dateString: string | null): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  return `${day}${ordinalSuffix(day)} ${month} ${year}`;
};

// Short form, e.g. "Jun 9, 2026"
export const formatShortDate = (dateString: string | null): string => {
  if (!dateString) return 'Unknown Date';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Full years between a date and today, calendar-correct.
// Returns null for invalid/missing input, 0 for same-year dates.
export const getYearsAgo = (dateString: string | null): number | null => {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const beforeAnniversary =
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeAnniversary) years--;
  return years;
};

// Whole days from today until a date, midnight-to-midnight (time of day ignored).
// Returns null for invalid/missing input, 0 for today, negative for past dates.
export const getDaysUntil = (dateString: string | null): number | null => {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

// Whole days from a date until today — the mirror of getDaysUntil.
// Returns null for invalid/missing input, 0 for today, negative for future dates.
export const getDaysSince = (dateString: string | null): number | null => {
  const until = getDaysUntil(dateString);
  return until === null ? null : -until;
};

const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365.25;

// Compact duration for tight UI — the foot of a backlog spine is 34px wide, so
// this has to stay under about six characters: "3d", "18d", "2mo", "1y 2mo".
export const formatDurationShort = (days: number | null): string => {
  if (days === null || days < 0) return "";
  if (days === 0) return "today";
  if (days < 30) return `${days}d`;
  const months = Math.round(days / DAYS_PER_MONTH);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / DAYS_PER_YEAR);
  const trailingMonths = Math.round((days - years * DAYS_PER_YEAR) / DAYS_PER_MONTH);
  if (trailingMonths <= 0) return `${years}y`;
  if (trailingMonths >= 12) return `${years + 1}y`;
  return `${years}y ${trailingMonths}mo`;
};

// Readable duration for prose, e.g. the Backlog header stat line.
export const formatDurationLong = (days: number | null): string => {
  if (days === null || days < 0) return "";
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.round(days / DAYS_PER_MONTH);
  if (months < 12) return months === 1 ? "1 month" : `${months} months`;
  const years = Math.floor(days / DAYS_PER_YEAR);
  const trailingMonths = Math.round((days - years * DAYS_PER_YEAR) / DAYS_PER_MONTH);
  const yearLabel = years === 1 ? "1 year" : `${years} years`;
  if (trailingMonths <= 0 || trailingMonths >= 12) return yearLabel;
  return `${yearLabel} ${trailingMonths}mo`;
};

// Today as month + ordinal day, e.g. "June 9th"
export const formatTodayMD = (): string => {
  const today = new Date();
  const day = today.getDate();
  const month = today.toLocaleString('en-US', { month: 'long' });
  return `${month} ${day}${ordinalSuffix(day)}`;
};
