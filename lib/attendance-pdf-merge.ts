import { PDFDocument } from "pdf-lib";

export type AttendancePdfMergeConfig = {
  gasUrl: string;
  gasSecret: string;
};

export type AttendancePdfMergeRange = {
  startDay: number;
  endDay: number;
};

export type AttendancePdfMergeKind = "weekly" | "monthly";

export type AttendancePdfMergeResult = {
  ok: boolean;
  found?: boolean;
  fileName?: string;
  fileId?: string;
  fileUrl?: string;
  size?: number | string | null;
  message?: string;
  includedDays?: number[];
  missingDays?: number[];
  pageCount?: number;
};

type GasPdfResponse = {
  ok: boolean;
  found?: boolean;
  message?: string;
  fileName?: string;
  base64?: string;
};

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("กรุณาระบุ month รูปแบบ YYYY-MM");
  }

  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);

  return {
    year,
    month: monthNumber,
    buddhistYear: year + 543,
    monthName: THAI_MONTHS[monthNumber - 1],
  };
}

function monthlyPdfName(month: string) {
  const info = parseMonth(month);

  return `บัญชีลงเวลาปฏิบัติราชการ_${info.monthName}_${info.buddhistYear}.pdf`;
}

function weeklyPdfName(month: string, range: AttendancePdfMergeRange) {
  const info = parseMonth(month);

  return `บัญชีลงเวลาปฏิบัติราชการ_${range.startDay}-${range.endDay}_${info.monthName}_${info.buddhistYear}.pdf`;
}

function dateForDay(month: string, day: number) {
  return `${month}-${pad2(day)}`;
}

async function callGasGetDailyPdf(
  config: AttendancePdfMergeConfig,
  date: string
) {
  const url = new URL(config.gasUrl);
  url.searchParams.set("action", "dailyPdf");
  url.searchParams.set("date", date);
  url.searchParams.set("mode", "file");
  url.searchParams.set("secret", config.gasSecret);

  const response = await fetch(url.toString(), {
    cache: "no-store",
    redirect: "follow",
  });
  const text = await response.text();
  let result: GasPdfResponse;

  try {
    result = JSON.parse(text) as GasPdfResponse;
  } catch {
    throw new Error("GAS ส่งข้อมูล PDF รายวันกลับมาไม่ถูกต้อง");
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "ไม่สามารถโหลด PDF รายวันจาก GAS ได้");
  }

  return result;
}

async function callGasSaveCombinedPdf(
  config: AttendancePdfMergeConfig,
  payload: {
    month: string;
    kind: AttendancePdfMergeKind;
    fileName: string;
    base64: string;
    range?: AttendancePdfMergeRange;
    includedDays: number[];
    missingDays: number[];
    pageCount: number;
  }
) {
  const response = await fetch(config.gasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      action: "saveCombinedPdf",
      secret: config.gasSecret,
      ...payload,
    }),
    cache: "no-store",
    redirect: "follow",
  });
  const text = await response.text();
  let result: AttendancePdfMergeResult;

  try {
    result = JSON.parse(text) as AttendancePdfMergeResult;
  } catch {
    throw new Error("GAS ส่งผลการบันทึก PDF รวมกลับมาไม่ถูกต้อง");
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "ไม่สามารถบันทึก PDF รวมลง Drive ได้");
  }

  return result;
}

export async function buildMergedAttendancePdf(input: {
  config: AttendancePdfMergeConfig;
  month: string;
  kind: AttendancePdfMergeKind;
  range?: AttendancePdfMergeRange;
}) {
  const info = parseMonth(input.month);
  const daysInMonth = new Date(info.year, info.month, 0).getDate();
  const range =
    input.range ?? ({
      startDay: 1,
      endDay: daysInMonth,
    } satisfies AttendancePdfMergeRange);
  const outputFileName =
    input.kind === "weekly"
      ? weeklyPdfName(input.month, range)
      : monthlyPdfName(input.month);

  const mergedPdf = await PDFDocument.create();
  const includedDays: number[] = [];
  const missingDays: number[] = [];
  let pageCount = 0;

  for (let day = range.startDay; day <= range.endDay; day += 1) {
    const daily = await callGasGetDailyPdf(
      input.config,
      dateForDay(input.month, day)
    );

    if (!daily.found || !daily.base64) {
      missingDays.push(day);
      continue;
    }

    const sourcePdf = await PDFDocument.load(
      Buffer.from(daily.base64, "base64")
    );
    const copiedPages = await mergedPdf.copyPages(
      sourcePdf,
      sourcePdf.getPageIndices()
    );

    copiedPages.forEach((page) => mergedPdf.addPage(page));
    includedDays.push(day);
    pageCount += copiedPages.length;
  }

  if (includedDays.length === 0 || pageCount === 0) {
    throw new Error("ยังไม่มี PDF รายวันสำหรับนำมารวมในช่วงที่เลือก");
  }

  const mergedBytes = await mergedPdf.save();
  const saved = await callGasSaveCombinedPdf(input.config, {
    month: input.month,
    kind: input.kind,
    range,
    fileName: outputFileName,
    base64: Buffer.from(mergedBytes).toString("base64"),
    includedDays,
    missingDays,
    pageCount,
  });

  return {
    ...saved,
    fileName: saved.fileName || outputFileName,
    includedDays,
    missingDays,
    pageCount,
  } satisfies AttendancePdfMergeResult;
}
