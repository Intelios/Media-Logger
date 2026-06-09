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

// Today as month + ordinal day, e.g. "June 9th"
export const formatTodayMD = (): string => {
  const today = new Date();
  const day = today.getDate();
  const month = today.toLocaleString('en-US', { month: 'long' });
  return `${month} ${day}${ordinalSuffix(day)}`;
};
