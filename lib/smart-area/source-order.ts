function sourceText(value: unknown) {
  return String(value ?? "").trim();
}

function sourceNumber(value: unknown) {
  const match = sourceText(value).match(/\d+/);
  if (!match) return 0;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pageFromUrl(value: unknown) {
  const raw = sourceText(value);
  if (!raw) return 0;

  try {
    return sourceNumber(new URL(raw, "https://smart-area.local").searchParams.get("page"));
  } catch {
    const match = raw.match(/[?&]page=(\d+)/i);
    return sourceNumber(match?.[1]);
  }
}

export function smartAreaPayloadPage(payload: any) {
  return (
    sourceNumber(payload?.smart_area_page) ||
    sourceNumber(payload?.smartAreaPage) ||
    sourceNumber(payload?.pageNumber) ||
    sourceNumber(payload?.page) ||
    sourceNumber(payload?.raw?.smartAreaPage) ||
    sourceNumber(payload?.raw?.smart_area_page) ||
    sourceNumber(payload?.raw?.pageNumber) ||
    sourceNumber(payload?.raw?.page) ||
    pageFromUrl(payload?.source_page_url) ||
    pageFromUrl(payload?.sourcePageUrl) ||
    pageFromUrl(payload?.pageUrl) ||
    pageFromUrl(payload?.raw?.sourcePageUrl) ||
    pageFromUrl(payload?.raw?.source_page_url) ||
    pageFromUrl(payload?.raw?.pageUrl) ||
    0
  );
}

export function smartAreaPayloadOrder(payload: any, fallback: unknown = "") {
  return (
    sourceNumber(payload?.row_order) ||
    sourceNumber(payload?.rowOrder) ||
    sourceNumber(payload?.order) ||
    sourceNumber(payload?.raw?.rowOrder) ||
    sourceNumber(payload?.raw?.row_order) ||
    sourceNumber(payload?.raw?.order) ||
    sourceNumber(fallback) ||
    0
  );
}
