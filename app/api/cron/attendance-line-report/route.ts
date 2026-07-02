import { NextResponse } from "next/server";

import { sendDailyAttendanceReport } from "@/lib/line/notifications";
import { sendDailyTelegramReport } from "@/lib/telegram/daily-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function todayBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();

  if (
    !secret ||
    request.headers.get("authorization") !==
      `Bearer ${secret}`
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  const date = todayBangkok();
  const requestOrigin = new URL(request.url).origin;

  const [lineResult, telegramResult] =
    await Promise.allSettled([
      sendDailyAttendanceReport(date),
      sendDailyTelegramReport(requestOrigin),
    ]);

  if (lineResult.status === "rejected") {
    console.error(
      "Automatic LINE attendance report failed:",
      lineResult.reason
    );
  }

  if (telegramResult.status === "rejected") {
    console.error(
      "Automatic Telegram attendance report failed:",
      telegramResult.reason
    );
  }

  const line =
    lineResult.status === "fulfilled"
      ? lineResult.value
      : {
          sent: false,
          error:
            lineResult.reason instanceof Error
              ? lineResult.reason.message
              : "ส่ง LINE ไม่สำเร็จ",
        };

  const telegram =
    telegramResult.status === "fulfilled"
      ? telegramResult.value
      : {
          sent: false,
          error:
            telegramResult.reason instanceof Error
              ? telegramResult.reason.message
              : "ส่ง Telegram ไม่สำเร็จ",
        };

  return NextResponse.json({
    ok:
      lineResult.status === "fulfilled" ||
      telegramResult.status === "fulfilled",
    date,
    line,
    telegram,
  });
}
