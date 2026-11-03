/** Adds one calendar month in UTC, clamping the day (Jan 31 -> Feb 28/29). */
export function addOneMonth(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const next = new Date(
    Date.UTC(year, month + 1, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds())
  );
  const lastDayOfNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDayOfNextMonth));
  return next;
}

/**
 * Next renewal after a successful charge. Anchored to the previous renewal date,
 * but never in the past: a store recovered after a lapse renews one month from now.
 */
export function nextRenewalAfter(previousRenewal: Date, now: Date = new Date()): Date {
  const next = addOneMonth(previousRenewal);
  return next.getTime() > now.getTime() ? next : addOneMonth(now);
}
