export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString();
}