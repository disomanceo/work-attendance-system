import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  monthlyPdfFound?: boolean;
  monthClosed?: boolean;
  canCloseMonth?: boolean;
  monthlyFileName?: string;
  deletedDailyPdfs?: number;
  deletedDailyDocs?: number;
  deletedMonthlyDocs?: number;
};

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

async function authorizeAdmin(
  request: Request,
  config: NonNullable<ReturnType<typeof getConfig>>
) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return { ok: false as const, status: 401, message: "กรุณาเข้าสู่ระบบ" };
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
      message: "Session ไม่ถูกต้องหรือหมดอายุ",
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
    !["admin", "director"].includes(profile.role)
  ) {
    return {
      ok: false as const,
      status: 403,
      message: "ไม่มีสิทธิ์จัดการรายงานรวมเดือน",
    };
  }

  return { ok: true as const };
}

async function callGas(
  config: NonNullable<ReturnType<typeof getConfig>>,
  month: string,
  mode: "metadata" | "file" | "build" | "status" | "close"
) {
  const actionByMode = {
    metadata: "monthlyPdf",
    file: "monthlyPdf",
    build: "buildMonthlyPdf",
    status: "monthStatus",
    close: "closeMonth",
  } as const;

  const url = new URL(config.gasUrl);
  url.searchParams.set("action", actionByMode[mode]);
  url.searchParams.set("month", month);
  url.searchParams.set(
    "mode",
    mode === "file" ? "file" : "metadata"
  );
  url.searchParams.set("secret", config.gasSecret);

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
      "GAS ส่งข้อมูลกลับมาไม่ถูกต้อง กรุณา Deploy เวอร์ชันล่าสุด"
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      result.message || "ไม่สามารถเรียก GAS รายงานรวมเดือนได้"
    );
  }

  return result;
}

async function handle(request: Request, allowWrite: boolean) {
  try {
    const config = getConfig();

    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ยังไม่ได้ตั้งค่า GAS_DAILY_PDF_API_URL หรือ GAS_DAILY_PDF_SECRET",
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
        { ok: false, message: "กรุณาระบุ month รูปแบบ YYYY-MM" },
        { status: 400 }
      );
    }

    if (mode === "status") {
      const result = await callGas(config, month, "status");
      return NextResponse.json(result);
    }

    if (allowWrite && (mode === "build" || mode === "close")) {
      const result = await callGas(
        config,
        month,
        mode as "build" | "close"
      );
      return NextResponse.json(result);
    }

    if (mode !== "metadata" && mode !== "file") {
      return NextResponse.json(
        {
          ok: false,
          message: "mode ต้องเป็น metadata, file, status, build หรือ close",
        },
        { status: 400 }
      );
    }

    const result = await callGas(
      config,
      month,
      mode as "metadata" | "file"
    );

    if (mode === "metadata") {
      return NextResponse.json({
        ok: true,
        found: Boolean(result.found),
        message: result.message,
        fileName: result.fileName,
        size: result.size ?? null,
        modifiedTime: result.modifiedTime ?? null,
      });
    }

    if (!result.found || !result.base64) {
      return NextResponse.json(
        {
          ok: true,
          found: false,
          message: result.message || "ยังไม่พบรายงานรวมเดือน",
        },
        { status: 404 }
      );
    }

    const body = Buffer.from(result.base64, "base64");
    const fileName = result.fileName || `monthly-attendance-${month}.pdf`;

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
  } catch (error) {
    console.error("Monthly PDF API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดในรายงานรวมเดือน",
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
