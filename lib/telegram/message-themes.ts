import "server-only";

export function escapeTelegramHtml(value: unknown) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function formatTelegramThaiDate(value: string) {
  const date = new Date(`${value}T12:00:00+07:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function buildTelegramCard(input: {
  icon: string;
  title: string;
  lines: Array<string | null | undefined | false>;
  footer?: Array<string | null | undefined | false>;
}) {
  const body = input.lines.filter(Boolean) as string[];
  const footer = (input.footer ?? []).filter(Boolean) as string[];

  return [
    `${input.icon} <b>${escapeTelegramHtml(input.title)}</b>`,
    "",
    ...body,
    ...(footer.length > 0 ? ["", ...footer] : []),
  ].join("\n");
}
