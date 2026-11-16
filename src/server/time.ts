export function zonedStart(date: string, timeZone: string): Date {
  return wallTimeToUtc(`${date}T00:00:00`, timeZone);
}

export function zonedEnd(date: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = next.toISOString().slice(0, 10);
  return new Date(zonedStart(nextDate, timeZone).getTime() - 1);
}

function wallTimeToUtc(localDateTime: string, timeZone: string): Date {
  const asUtc = new Date(`${localDateTime}Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(asUtc).map((part) => [part.type, part.value]),
  );
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return new Date(asUtc.getTime() - (zonedAsUtc - asUtc.getTime()));
}
