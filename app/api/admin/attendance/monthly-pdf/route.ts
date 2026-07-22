import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildMergedAttendancePdf } from "@/lib/attendance-pdf-merge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WeeklyPdfPeriod = {
  startDay: number;
  endDay: number;
  found: boolean;
  fileName?: string;
};

type GasResponse = {
  ok: boolean;
  found?: boolean;
  message?: string;
  fileName?: string;
  size?: number | string | null;
  modifiedTime?: string | null;
  base64?: string;
  includedDays?: number[];
  missingDays?: number[];
  dailyPdfDays?: number[];
  weeklyPdfPeriods?: WeeklyPdfPeriod[];
  monthlyPdfFound?: boolean;
  monthClosed?: boolean;
  canCloseMonth?: boolean;
  monthlyFileName?: string;
  deletedDailyPdfs?: number;
  deletedDailyDocs?: number;
  deletedMonthlyDocs?: number;
};

type GasMode =
  | "metadata"
  | "file"
  | "weekly-metadata"
  | "weekly-file"
  | "build"
  | "build-weekly"
  | "status"
  | "close";

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gasUrl = process.env.GAS_DAILY_PDF_API_URL;
  const gasSecret = process.env.GAS_DAILY_PDF_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !gasUrl || !gasSecret) {
    return null;
  }

  return { supabaseUrl, serviceRoleKey, gasUrl, gasSecret };
}

function isValidMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function parseWeekRange(url: URL) {
  const startDay = Number(url.searchParams.get("startDay") ?? "");
  const endDay = Number(url.searchParams.get("endDay") ?? "");

  if (
    !Number.isInteger(startDay) ||
    !Number.isInteger(endDay) ||
    startDay < 1 ||
    startDay > 31 ||
    endDay < startDay ||
    endDay > 31
  ) {
    return null;
  }

  return { startDay, endDay };
}

async function authorizeAdmin(
  request: Request,
  config: NonNullable<ReturnType<typeof getConfig>>
) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return { ok: false as const, status: 401, message: "เธเธฃเธธเธ“เธฒเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธ" };
  }

  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser(token);

  if (!user) {
    return {
      ok: false as const,
      status: 401,
      message: "Session เนเธกเนเธ–เธนเธเธ•เนเธญเธเธซเธฃเธทเธญเธซเธกเธ”เธญเธฒเธขเธธ",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.account_status !== "active" ||
    !["admin", "director", "staff"].includes(profile.role)
  ) {
    return {
      ok: false as const,
      status: 403,
      message: "เนเธกเนเธกเธตเธชเธดเธ—เธเธดเนเธเธฑเธ”เธเธฒเธฃเธฃเธฒเธขเธเธฒเธ PDF",
    };
  }

  return { ok: true as const };
}

async function callGas(
  config: NonNullable<ReturnType<typeof getConfig>>,
  month: string,
  mode: GasMode,
  weekRange?: { startDay: number; endDay: number }
) {
  const actionByMode: Record<GasMode, string> = {
    metadata: "monthlyPdf",
    file: "monthlyPdf",
    "weekly-metadata": "weeklyPdf",
    "weekly-file": "weeklyPdf",
    build: "buildMonthlyPdf",
    "build-weekly": "buildWeeklyPdf",
    status: "monthStatus",
    close: "closeMonth",
  };

  const url = new URL(config.gasUrl);
  url.searchParams.set("action", actionByMode[mode]);
  url.searchParams.set("month", month);
  url.searchParams.set(
    "mode",
    mode === "file" || mode === "weekly-file" ? "file" : "metadata"
  );
  url.searchParams.set("secret", config.gasSecret);

  if (weekRange) {
    url.searchParams.set("startDay", String(weekRange.startDay));
    url.searchParams.set("endDay", String(weekRange.endDay));
  }

  const response = await fetch(url.toString(), {
    cache: "no-store",
    redirect: "follow",
  });
  const text = await response.text();
  let result: GasResponse;

  try {
    result = JSON.parse(text) as GasResponse;
  } catch {
    throw new Error(
      "GAS เธชเนเธเธเนเธญเธกเธนเธฅเธเธฅเธฑเธเธกเธฒเนเธกเนเธ–เธนเธเธ•เนเธญเธ เธเธฃเธธเธ“เธฒ Deploy เน€เธงเธญเธฃเนเธเธฑเธเธฅเนเธฒเธชเธธเธ”"
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธฃเธตเธขเธ GAS เธฃเธฒเธขเธเธฒเธ PDF เนเธ”เน");
  }

  return result;
}

function metadataResponse(result: GasResponse) {
  return NextResponse.json({
    ok: true,
    found: Boolean(result.found),
    message: result.message,
    fileName: result.fileName,
    size: result.size ?? null,
    modifiedTime: result.modifiedTime ?? null,
  });
}

function pdfResponse(result: GasResponse, fallbackName: string) {
  if (!result.found || !result.base64) {
    return NextResponse.json(
      {
        ok: true,
        found: false,
        message: result.message || "เธขเธฑเธเนเธกเนเธเธเธฃเธฒเธขเธเธฒเธ PDF",
      },
      { status: 404 }
    );
  }

  const body = Buffer.from(result.base64, "base64");
  const fileName = result.fileName || fallbackName;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        fileName
      )}`,
    },
  });
}

async function handle(request: Request, allowWrite: boolean) {
  try {
    const config = getConfig();

    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "เธขเธฑเธเนเธกเนเนเธ”เนเธ•เธฑเนเธเธเนเธฒ GAS_DAILY_PDF_API_URL เธซเธฃเธทเธญ GAS_DAILY_PDF_SECRET",
        },
        { status: 500 }
      );
    }

    const auth = await authorizeAdmin(request, config);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const url = new URL(request.url);
    const month = url.searchParams.get("month")?.trim() ?? "";
    const mode = url.searchParams.get("mode")?.trim() ?? "metadata";

    if (!isValidMonth(month)) {
      return NextResponse.json(
        { ok: false, message: "เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธ month เธฃเธนเธเนเธเธ YYYY-MM" },
        { status: 400 }
      );
    }

    if (mode === "status") {
      const result = await callGas(config, month, "status");

      return NextResponse.json({
        ok: true,
        dailyPdfDays: Array.isArray(result.dailyPdfDays)
          ? result.dailyPdfDays
          : [],
        weeklyPdfPeriods: Array.isArray(result.weeklyPdfPeriods)
          ? result.weeklyPdfPeriods
          : [],
        monthlyPdfFound: Boolean(result.monthlyPdfFound),
        monthClosed: Boolean(result.monthClosed),
        canCloseMonth: Boolean(result.canCloseMonth),
        monthlyFileName: result.monthlyFileName,
        message: result.message,
      });
    }

    if (allowWrite && mode === "build-weekly") {
      const weekRange = parseWeekRange(url);

      if (!weekRange) {
        return NextResponse.json(
          { ok: false, message: "เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธ startDay เนเธฅเธฐ endDay เนเธซเนเธ–เธนเธเธ•เนเธญเธ" },
          { status: 400 }
        );
      }

      const result = await buildMergedAttendancePdf({
        config,
        month,
        kind: "weekly",
        range: weekRange,
      });

      return NextResponse.json(result);
    }

    if (allowWrite && mode === "build") {
      const result = await buildMergedAttendancePdf({
        config,
        month,
        kind: "monthly",
      });

      return NextResponse.json(result);
    }

    if (allowWrite && mode === "close") {
      const result = await callGas(config, month, "close");
      return NextResponse.json(result);
    }

    if (mode === "weekly-metadata" || mode === "weekly-file") {
      const weekRange = parseWeekRange(url);

      if (!weekRange) {
        return NextResponse.json(
          { ok: false, message: "เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธ startDay เนเธฅเธฐ endDay เนเธซเนเธ–เธนเธเธ•เนเธญเธ" },
          { status: 400 }
        );
      }

      const result = await callGas(
        config,
        month,
        mode as "weekly-metadata" | "weekly-file",
        weekRange
      );

      if (mode === "weekly-metadata") {
        return metadataResponse(result);
      }

      return pdfResponse(
        result,
        `weekly-attendance-${month}-${weekRange.startDay}-${weekRange.endDay}.pdf`
      );
    }

    if (mode !== "metadata" && mode !== "file") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "mode เธ•เนเธญเธเน€เธเนเธ metadata, file, weekly-metadata, weekly-file, status, build, build-weekly เธซเธฃเธทเธญ close",
        },
        { status: 400 }
      );
    }

    const result = await callGas(config, month, mode as "metadata" | "file");

    if (mode === "metadata") {
      return metadataResponse(result);
    }

    return pdfResponse(result, `monthly-attendance-${month}.pdf`);
  } catch (error) {
    console.error("Monthly PDF API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เนเธเธฃเธฒเธขเธเธฒเธ PDF",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request, false);
}

export async function POST(request: Request) {
  return handle(request, true);
}
