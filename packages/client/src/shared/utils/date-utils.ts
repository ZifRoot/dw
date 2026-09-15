// Утилиты для работы с датами
export function toDate(value: any): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return isNaN(parsed) ? null : new Date(parsed);
  }
  return null;
}
