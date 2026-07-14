import { NextResponse } from "next/server";

import { sendStudentAttendanceReminder } from "@/lib/telegram/student-attendance-reminder";

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

  console.info("Student attendance reminder cron started", {
    date,
    schedule: request.headers.get("x-vercel-cron-schedule"),
  });

  try {
    const telegram = await sendStudentAttendanceReminder(
      requestOrigin,
      date
    );

    return NextResponse.json({
      ok: true,
      date,
      telegram,
    });
  } catch (error) {
    console.error("Student attendance reminder cron failed:", error);

    return NextResponse.json(
      {
        ok: false,
        date,
        message:
          error instanceof Error
            ? error.message
            : "Student attendance reminder failed",
      },
      { status: 500 }
    );
  }
}
