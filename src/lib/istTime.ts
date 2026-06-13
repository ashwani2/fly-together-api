/**
 * India Standard Time (Asia/Kolkata, UTC+05:30) presentation layer.
 *
 * We keep storing UTC instants in the database (correct + comparable), but every
 * `Date` that gets serialized into a JSON response — `expiresAt`, `createdAt`,
 * `updatedAt`, etc. — is rendered as an IST wall-clock string with a `+05:30`
 * offset. This module is imported for its side effects, so import it FIRST.
 */

// Make Node's local-time helpers (logs, toLocaleString without an explicit zone) use IST too.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Override JSON serialization only (NOT toISOString), so Prisma's own
// parameter serialization is unaffected — only `res.json(...)` output changes.
Date.prototype.toJSON = function (this: Date): string {
  const t = this.getTime();
  if (Number.isNaN(t)) return null as unknown as string;
  return new Date(t + IST_OFFSET_MS).toISOString().replace('Z', '+05:30');
};

/** Human-readable absolute IST timestamp, e.g. "11 Jun 2026, 5:21 pm IST". */
export function formatIST(d: Date): string {
  return (
    d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    }) + ' IST'
  );
}
