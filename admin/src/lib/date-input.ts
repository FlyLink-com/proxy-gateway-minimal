export function isoDateFromOffsetDays(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function isoDateFromOffsetMonths(offsetMonths: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + offsetMonths);
  return date.toISOString().slice(0, 10);
}

export function dateInputToIsoUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}
