/** The email defaults endpoint returns cc/bcc as comma-separated strings; the send endpoint expects arrays. */
export function splitEmailList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}
