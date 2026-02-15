import { dbService } from "./db";
import { getNavigationYears, setNavigationYears } from "./settings";

export const NAVIGATION_YEARS_UPDATED_EVENT = "media-logger-navigation-years-updated";

function mergeAndSortYears(years: string[]): string[] {
  return Array.from(new Set(years))
    .filter(y => /^\d{4}$/.test(y))
    .sort((a, b) => Number(a) - Number(b));
}

export function getCurrentYearString(): string {
  return String(new Date().getFullYear());
}

export async function getAvailableNavigationYears(): Promise<string[]> {
  const configuredYears = getNavigationYears();
  const db = await dbService.connect();
  const dbYearRows = await db.select<{ year: number }[]>(
    "SELECT DISTINCT year_completed as year FROM entries WHERE year_completed IS NOT NULL ORDER BY year_completed ASC"
  );

  const dbYears = dbYearRows.map(row => String(row.year));

  return mergeAndSortYears([
    ...configuredYears,
    ...dbYears,
    getCurrentYearString(),
  ]);
}

export function updateNavigationYears(years: string[]): string[] {
  const saved = setNavigationYears(years);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NAVIGATION_YEARS_UPDATED_EVENT, { detail: saved }));
  }

  return saved;
}
