import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notifyLeaveSubmitted } from "@/lib/line/notifications";
import { notifyLeaveSubmittedTelegram } from "@/lib/telegram/leave-workflow-notifications";
import {
  issueDocumentNumber,
  markDocumentNumberIssue,
} from "@/lib/document-numbers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type LeaveType = "personal" | "sick";
type SubmissionKind = "advance" | "urgent" | "retrospective" | "overdue";

type GasAssetResponse = {
  ok?: boolean;
  message?: string;
  base64?: string;
  mimeType?: string;
};

type GasPendingResponse = {
  ok?: boolean;
  message?: string;
  status?: string;
  leaveNumber?: string;
  workingDocumentId?: string;
  workingDocumentUrl?: string;
  requestFolderId?: string;
  evidenceFileId?: string;
  evidenceFileUrl?: string;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
]);

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const leaveGasUrl = process.env.GAS_LEAVE_DOCUMENT_URL;
  const leaveGasSecret = process.env.LEAVE_DOCUMENT_SECRET;
  const profileGasUrl = process.env.GAS_PROFILE_UPLOAD_URL;
  const profileGasSecret = process.env.GAS_PROFILE_UPLOAD_SECRET;

  if (
    !url ||
    !publishable ||
    !service ||
    !leaveGasUrl ||
    !leaveGasSecret ||
    !profileGasUrl ||
    !profileGasSecret
  ) {
    return null;
  }

  return {
    url,
    publishable,
    service,
    leaveGasUrl,
    leaveGasSecret,
    profileGasUrl,
    profileGasSecret,
  };
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("เธฃเธนเธเนเธเธเธงเธฑเธเธ—เธตเนเนเธกเนเธ–เธนเธเธ•เนเธญเธ");
  }

  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("เธงเธฑเธเธ—เธตเนเนเธกเนเธ–เธนเธเธ•เนเธญเธ");
  }
  return date;
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function todayKey() {
  return dateKey(new Date());
}

async function loadFiscalYearSettings(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("attendance_settings")
    .select(
      "active_fiscal_year, fiscal_year_start_date, fiscal_year_end_date"
    )
    .eq("id", 1)
    .maybeSingle();

  if (
    error ||
    !data?.active_fiscal_year ||
    !data.fiscal_year_start_date ||
    !data.fiscal_year_end_date
  ) {
    throw new Error(
      "เธขเธฑเธเนเธกเนเนเธ”เนเธเธณเธซเธเธ”เธเธตเธเธเธเธฃเธฐเธกเธฒเธ“ เธเธฃเธธเธ“เธฒเนเธซเนเธเธนเนเธญเธณเธเธงเธขเธเธฒเธฃเธ•เธฑเนเธเธเนเธฒเธเนเธญเธ"
    );
  }

  const activeFiscalYear = Number(data.active_fiscal_year);

  if (
    !Number.isInteger(activeFiscalYear) ||
    activeFiscalYear < 2500 ||
    activeFiscalYear > 2700
  ) {
    throw new Error("เธเนเธฒเธเธตเธเธเธเธฃเธฐเธกเธฒเธ“เนเธกเนเธ–เธนเธเธ•เนเธญเธ");
  }

  return {
    activeFiscalYear,
    startDate: String(data.fiscal_year_start_date),
    endDate: String(data.fiscal_year_end_date),
  };
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function holidaySet(
  admin: SupabaseClient,
  startDate: string,
  endDate: string
) {
  const { data, error } = await admin
    .from("leave_holidays")
    .select("holiday_date")
    .eq("is_active", true)
    .gte("holiday_date", startDate)
    .lte("holiday_date", endDate);

  if (error) throw new Error("เนเธซเธฅเธ”เธงเธฑเธเธซเธขเธธเธ”เนเธกเนเธชเธณเน€เธฃเนเธ");
  return new Set((data ?? []).map((item) => item.holiday_date as string));
}

function isWorkDay(date: Date, holidays: Set<string>) {
  // เนเธฃเธเน€เธฃเธตเธขเธเธญเธฒเธเน€เธเธดเธ”เน€เธฃเธตเธขเธเธซเธฃเธทเธญเธเธเธดเธเธฑเธ•เธดเธเธฒเธเธเธ”เน€เธเธขเนเธเธงเธฑเธเน€เธชเธฒเธฃเนโ€“เธญเธฒเธ—เธดเธ•เธขเน
  // เธเธถเธเธเธฑเธเธงเธฑเธเน€เธชเธฒเธฃเนเนเธฅเธฐเธงเธฑเธเธญเธฒเธ—เธดเธ•เธขเนเน€เธเนเธเธงเธฑเธเธ—เธตเนเธขเธทเนเธเธฅเธฒเนเธ”เนเธ•เธฒเธกเธเธเธ•เธด
  // เธขเธเน€เธงเนเธเธงเธฑเธเธ—เธตเนเธเธนเนเธ”เธนเนเธฅเธเธณเธซเธเธ”เนเธงเนเนเธเธ•เธฒเธฃเธฒเธ leave_holidays เน€เธ—เนเธฒเธเธฑเนเธ
  return !holidays.has(dateKey(date));
}

function countWorkDaysInclusive(
  start: Date,
  end: Date,
  holidays: Set<string>
) {
  let count = 0;
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor = addDays(cursor, 1)
  ) {
    if (isWorkDay(cursor, holidays)) count += 1;
  }
  return count;
}

function countWorkDaysExclusiveStart(
  start: Date,
  end: Date,
  holidays: Set<string>
) {
  if (end <= start) return 0;

  let count = 0;
  for (
    let cursor = addDays(start, 1);
    cursor <= end;
    cursor = addDays(cursor, 1)
  ) {
    if (isWorkDay(cursor, holidays)) count += 1;
  }
  return count;
}

async function callGas(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = 50000
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "Google Apps Script เธ•เธญเธเธเธฅเธฑเธเธเนเธฒเน€เธเธดเธ 50 เธงเธดเธเธฒเธ—เธต เธเธฃเธธเธ“เธฒเธ•เธฃเธงเธเธชเธญเธ Deployment เนเธฅเธฐเธชเธดเธ—เธเธดเนเธเธฒเธฃเน€เธเนเธฒเธ–เธถเธ"
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Google Apps Script เนเธกเนเนเธ”เนเธ•เธญเธเธเธฅเธฑเธเน€เธเนเธ JSON เธเธฃเธธเธ“เธฒ Deploy เน€เธงเธญเธฃเนเธเธฑเธเธฅเนเธฒเธชเธธเธ”"
    );
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "Google Apps Script เธ—เธณเธเธฒเธเนเธกเนเธชเธณเน€เธฃเนเธ"
    );
  }

  return result;
}

async function getSignatureAsset(
  profileGasUrl: string,
  profileGasSecret: string,
  fileId: string
) {
  const result = (await callGas(profileGasUrl, {
    secret: profileGasSecret,
    action: "get",
    fileId,
  })) as GasAssetResponse;

  if (!result.base64) {
    throw new Error("เนเธกเนเธเธเธเนเธญเธกเธนเธฅเธฅเธฒเธขเน€เธเนเธ เธเธฃเธธเธ“เธฒเธญเธฑเธเนเธซเธฅเธ”เธฅเธฒเธขเน€เธเนเธเนเธซเธกเน");
  }

  return {
    base64: result.base64,
    mimeType: result.mimeType || "image/png",
  };
}

async function authorize(request: Request) {
  const cfg = config();
  if (!cfg) {
    throw new Error(
      "Environment Variables เธเธญเธ Supabase เธซเธฃเธทเธญ Google Apps Script เธขเธฑเธเนเธกเนเธเธฃเธ"
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return { ok: false as const, status: 401, message: "เธเธฃเธธเธ“เธฒเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธ" };
  }

  const auth = createClient(cfg.url, cfg.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await auth.auth.getUser(token);

  if (error || !user) {
    return { ok: false as const, status: 401, message: "Session เธซเธกเธ”เธญเธฒเธขเธธ" };
  }

  const admin = createClient(cfg.url, cfg.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id, full_name, position, role, account_status, signature_file_id"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.account_status !== "active") {
    return {
      ok: false as const,
      status: 403,
      message: "เธเธฑเธเธเธตเธขเธฑเธเนเธกเนเธเธฃเนเธญเธกเนเธเนเธเธฒเธ",
    };
  }

  return { ok: true as const, user, profile, admin, cfg };
}

export async function GET(request: Request) {
  try {
    const authorization = await authorize(request);
    if (!authorization.ok) {
      return NextResponse.json(
        { ok: false, message: authorization.message },
        { status: authorization.status }
      );
    }

    const { admin, user } = authorization;
    const url = new URL(request.url);
    const fiscalYearValue = Number(url.searchParams.get("fiscalYear"));
    const fiscalSettings = await loadFiscalYearSettings(admin);
    const fiscalYear = Number.isInteger(fiscalYearValue)
      ? fiscalYearValue
      : fiscalSettings.activeFiscalYear;

    const { data: requests, error } = await admin
      .from("leave_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error("เนเธซเธฅเธ”เธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเธฅเธฒเนเธกเนเธชเธณเน€เธฃเนเธ");

    const countedStatuses = new Set([
      "pending",
      "approved",
      "rejected",
    ]);

    const counted = (requests ?? []).filter(
      (item) =>
        countedStatuses.has(String(item.status)) &&
        Number(item.fiscal_year) === fiscalYear
    );

    const sick = counted.filter((item) => item.leave_type === "sick");
    const personal = counted.filter(
      (item) => item.leave_type === "personal"
    );

    const summary = {
      fiscalYear,
      sick: {
        times: sick.length,
        days: sick.reduce(
          (sum, item) => sum + Number(item.total_work_days || 0),
          0
        ),
      },
      personal: {
        times: personal.length,
        days: personal.reduce(
          (sum, item) => sum + Number(item.total_work_days || 0),
          0
        ),
      },
      combined: {
        times: counted.length,
        days: counted.reduce(
          (sum, item) => sum + Number(item.total_work_days || 0),
          0
        ),
      },
    };

    return NextResponse.json({ ok: true, requests, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let reservedRequestId: string | null = null;
  let reservedAdmin: SupabaseClient | null = null;
try {
    const authorization = await authorize(request);
    if (!authorization.ok) {
      return NextResponse.json(
        { ok: false, message: authorization.message },
        { status: authorization.status }
      );
    }

    const { admin, user, profile, cfg } = authorization;
    reservedAdmin = admin;
    reservedRequestId = crypto.randomUUID();
    const requestId = reservedRequestId;
    const form = await request.formData();

    const leaveType = String(form.get("leaveType") ?? "") as LeaveType;
    const startDateValue = String(form.get("startDate") ?? "");
    const endDateValue = String(form.get("endDate") ?? "");
    const reason = String(form.get("reason") ?? "").trim();
    const lateSubmissionReason = String(
      form.get("lateSubmissionReason") ?? ""
    ).trim();
    const evidenceDescriptionInput = String(
      form.get("evidenceDescription") ?? ""
    ).trim();

    const attachmentValue = form.get("attachment");
    const attachment =
      attachmentValue instanceof File && attachmentValue.size > 0
        ? attachmentValue
        : null;

    if (!["personal", "sick"].includes(leaveType)) {
      return NextResponse.json(
        { ok: false, message: "เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธเธฃเธฐเน€เธ เธ—เธเธฒเธฃเธฅเธฒ" },
        { status: 400 }
      );
    }

    if (reason.length < 5) {
      return NextResponse.json(
        { ok: false, message: "เธเธฃเธธเธ“เธฒเธฃเธฐเธเธธเน€เธซเธ•เธธเธเธฅเธญเธขเนเธฒเธเธเนเธญเธข 5 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ" },
        { status: 400 }
      );
    }

    if (!profile.signature_file_id) {
      return NextResponse.json(
        {
          ok: false,
          message: "เธเธฃเธธเธ“เธฒเธญเธฑเธเนเธซเธฅเธ”เธฅเธฒเธขเน€เธเนเธเนเธเธซเธเนเธฒเธเนเธญเธกเธนเธฅเธชเนเธงเธเธ•เธฑเธงเธเนเธญเธเธขเธทเนเธเนเธเธฅเธฒ",
        },
        { status: 400 }
      );
    }

    const startDate = parseDate(startDateValue);
    const endDate = parseDate(endDateValue);

    if (endDate < startDate) {
      return NextResponse.json(
        { ok: false, message: "เธงเธฑเธเธชเธดเนเธเธชเธธเธ”เธ•เนเธญเธเนเธกเนเธเนเธญเธเธงเธฑเธเน€เธฃเธดเนเธกเธฅเธฒ" },
        { status: 400 }
      );
    }

    const todayValue = todayKey();
    const today = parseDate(todayValue);
    const rangeStart = dateKey(
      new Date(Math.min(startDate.getTime(), today.getTime()))
    );
    const rangeEnd = dateKey(
      new Date(Math.max(endDate.getTime(), today.getTime()))
    );

    const holidays = await holidaySet(admin, rangeStart, rangeEnd);
    const totalWorkDays = countWorkDaysInclusive(startDate, endDate, holidays);

    if (totalWorkDays < 1) {
      return NextResponse.json(
        { ok: false, message: "เธเนเธงเธเธงเธฑเธเธ—เธตเนเน€เธฅเธทเธญเธเนเธกเนเธกเธตเธงเธฑเธเธ—เธณเธเธฒเธฃ" },
        { status: 400 }
      );
    }

    let submissionKind: SubmissionKind;
    let advanceWorkDays = 0;
    let retrospectiveWorkDays = 0;

    if (startDate > today) {
      advanceWorkDays = countWorkDaysExclusiveStart(today, startDate, holidays);
      submissionKind =
        leaveType === "personal" && advanceWorkDays < 3
          ? "urgent"
          : "advance";
    } else if (endDate < today) {
      retrospectiveWorkDays = countWorkDaysExclusiveStart(
        endDate,
        today,
        holidays
      );
      submissionKind =
        retrospectiveWorkDays <= 3 ? "retrospective" : "overdue";
    } else {
      submissionKind = leaveType === "personal" ? "urgent" : "retrospective";
    }

    if (submissionKind === "overdue" && lateSubmissionReason.length < 5) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "เนเธเธฅเธฒเธขเนเธญเธเธซเธฅเธฑเธเน€เธเธดเธ 3 เธงเธฑเธเธ—เธณเธเธฒเธฃ เธ•เนเธญเธเธฃเธฐเธเธธเน€เธซเธ•เธธเธเธฅเธญเธขเนเธฒเธเธเนเธญเธข 5 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ",
        },
        { status: 400 }
      );
    }

    const medicalCertificateRequired =
      leaveType === "sick" && totalWorkDays >= 3;

    if (medicalCertificateRequired && !attachment) {
      return NextResponse.json(
        {
          ok: false,
          message: "เธฅเธฒเธเนเธงเธขเธ•เธฑเนเธเนเธ•เน 3 เธงเธฑเธเธ—เธณเธเธฒเธฃเธเธถเนเธเนเธ เธ•เนเธญเธเนเธเธเนเธเธฃเธฑเธเธฃเธญเธเนเธเธ—เธขเน",
        },
        { status: 400 }
      );
    }
    if (attachment) {
      if (attachment.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { ok: false, message: "เนเธเธฅเนเนเธเธเธ•เนเธญเธเธกเธตเธเธเธฒเธ”เนเธกเนเน€เธเธดเธ 5 MB" },
          { status: 400 }
        );
      }

      if (!ALLOWED_MIME_TYPES.has(attachment.type)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "เธฃเธธเนเธเธเธตเนเธฃเธญเธเธฃเธฑเธเธซเธฅเธฑเธเธเธฒเธเน€เธเธเธฒเธฐ JPG เนเธฅเธฐ PNG เน€เธเธทเนเธญเธฃเธงเธกเนเธงเนเนเธ PDF เธเธเธฑเธเน€เธ”เธตเธขเธง",
          },
          { status: 400 }
        );
      }
    }

    const fiscalSettings = await loadFiscalYearSettings(admin);

    if (
      startDateValue < fiscalSettings.startDate ||
      startDateValue > fiscalSettings.endDate
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: `เธงเธฑเธเธ—เธตเนเธฅเธฒเธญเธขเธนเนเธเธญเธเธเนเธงเธเธเธตเธเธเธเธฃเธฐเธกเธฒเธ“ ${fiscalSettings.activeFiscalYear}`,
        },
        { status: 400 }
      );
    }

    const fiscalYear = fiscalSettings.activeFiscalYear;

    const { count: approvedCount, error: countError } = await admin
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("leave_type", leaveType)
      .eq("fiscal_year", fiscalYear)
      .eq("status", "approved");

    if (countError) throw new Error("เธเธณเธเธงเธ“เธเธฃเธฑเนเธเธ—เธตเนเธฅเธฒเนเธกเนเธชเธณเน€เธฃเนเธ");

    const { data: overlaps, error: overlapError } = await admin
      .from("leave_requests")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["pending", "approved"])
      .lte("start_date", endDateValue)
      .gte("end_date", startDateValue)
      .limit(1);

    if (overlapError) throw new Error("เธ•เธฃเธงเธเธชเธญเธเธเนเธงเธเธงเธฑเธเธฅเธฒเธเนเธญเธเนเธกเนเธชเธณเน€เธฃเนเธ");

    if ((overlaps ?? []).length > 0) {
      return NextResponse.json(
        { ok: false, message: "เธเนเธงเธเธงเธฑเธเธ—เธตเนเน€เธฅเธทเธญเธเธกเธตเนเธเธฅเธฒเธญเธขเธนเนเนเธฅเนเธง" },
        { status: 409 }
      );
    }

    // เธ•เธฃเธงเธเธชเธญเธเธเธฒเธฃเธฅเธเน€เธงเธฅเธฒเนเธฅเธฐเนเธเธฃเธฒเธเธเธฒเธฃเธเนเธญเธเธชเธฃเนเธฒเธเน€เธญเธเธชเธฒเธฃเนเธเธฅเธฒ
    const [{ data: attendanceConflict }, { data: dutyConflict }] =
      await Promise.all([
        admin
          .from("attendance_records")
          .select("id,work_date,check_in_at")
          .eq("user_id", user.id)
          .gte("work_date", startDateValue)
          .lte("work_date", endDateValue)
          .not("check_in_at", "is", null)
          .order("work_date", { ascending: true })
          .limit(1)
          .maybeSingle(),

        admin
          .from("official_duty_requests")
          .select("id,duty_date,duty_end_date,status")
          .eq("user_id", user.id)
          .in("status", ["pending", "approved"])
          .lte("duty_date", endDateValue)
          .gte("duty_end_date", startDateValue)
          .order("duty_date", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

    if (attendanceConflict) {
      return NextResponse.json(
        {
          ok: false,
          message: `เธงเธฑเธเธ—เธตเน ${attendanceConflict.work_date} เนเธ”เนเธฅเธเน€เธงเธฅเธฒเธเธเธดเธเธฑเธ•เธดเธเธฒเธเนเธฅเนเธง เธเธถเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธขเธทเนเธเธฅเธฒเธเธฃเธญเธเธเธฅเธธเธกเธงเธฑเธเธ”เธฑเธเธเธฅเนเธฒเธงเนเธ”เน`,
        },
        { status: 409 }
      );
    }

    if (dutyConflict) {
      return NextResponse.json(
        {
          ok: false,
          message: `เธงเธฑเธเธ—เธตเน ${dutyConflict.duty_date} เธกเธตเธเธณเธเธญเนเธเธฃเธฒเธเธเธฒเธฃเธซเธฃเธทเธญเนเธ”เนเธฃเธฑเธเธญเธเธธเธเธฒเธ•เนเธฅเนเธง เธเธถเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธขเธทเนเธเธฅเธฒเธเนเธณเนเธ”เน`,
        },
        { status: 409 }
      );
    }
    const applicantSignature = await getSignatureAsset(
      cfg.profileGasUrl,
      cfg.profileGasSecret,
      profile.signature_file_id
    );

    let evidence:
      | {
          name: string;
          mimeType: string;
          size: number;
          base64: string;
        }
      | null = null;

    if (attachment) {
      evidence = {
        name: attachment.name,
        mimeType: attachment.type,
        size: attachment.size,
        base64: Buffer.from(await attachment.arrayBuffer()).toString("base64"),
      };
    }

    const issuedNumber = await issueDocumentNumber(admin, {
      seriesCode: "LEAVE",
      documentType: "LEAVE",
      referenceId: requestId,
      issuedBy: user.id,
      metadata: {
        leaveType,
        startDate: startDateValue,
        endDate: endDateValue,
        applicantName: profile.full_name,
      },
    });

    const submittedAt = new Date().toISOString();

    const gasResult = (await callGas(cfg.leaveGasUrl, {
      action: "leaveCreatePending",
      secret: cfg.leaveGasSecret,
      roleKey: profile.role,
      fiscalYear,
      documentNumber: issuedNumber.formattedNumber,
      documentRunningNumber: issuedNumber.runningNumber,
      documentYear: issuedNumber.buddhistYear,
      documentPrefix: issuedNumber.prefix,
      documentMode: issuedNumber.mode,
      fullName: profile.full_name,
      position: profile.position || profile.role,
      leaveType,
      startDate: startDateValue,
      endDate: endDateValue,
      totalDays: totalWorkDays,
      reason,
      submittedAt,
      applicantSignatureBase64:
        `data:${applicantSignature.mimeType};base64,${applicantSignature.base64}`,
      evidenceName: evidence?.name || "",
      evidenceDescription: evidenceDescriptionInput,
      evidenceMimeType: evidence?.mimeType || "",
      evidenceBase64: evidence
        ? `data:${evidence.mimeType};base64,${evidence.base64}`
        : "",
    })) as GasPendingResponse;

    if (
      !gasResult.workingDocumentId ||
      !gasResult.requestFolderId
    ) {
      throw new Error("GAS เนเธกเนเธเธทเธเธเนเธญเธกเธนเธฅเน€เธญเธเธชเธฒเธฃเนเธเธฅเธฒเธ—เธตเนเธเธณเน€เธเนเธ");
    }
    const { data, error } = await admin
      .from("leave_requests")
      .insert({
        id: requestId,
        user_id: user.id,
        leave_type: leaveType,
        start_date: startDateValue,
        end_date: endDateValue,
        total_work_days: totalWorkDays,
        reason,
        fiscal_year: fiscalYear,
        submission_kind: submissionKind,
        advance_work_days: advanceWorkDays,
        retrospective_work_days: retrospectiveWorkDays,
        late_submission_reason:
          submissionKind === "overdue" ? lateSubmissionReason : null,
        medical_certificate_required: medicalCertificateRequired,

        sequence_number: issuedNumber.runningNumber,
        leave_number: issuedNumber.formattedNumber,
        document_number_issue_id: issuedNumber.issueId,
        working_document_id: gasResult.workingDocumentId,
        working_document_url: gasResult.workingDocumentUrl || null,
        drive_request_folder_id: gasResult.requestFolderId,
        evidence_file_id: gasResult.evidenceFileId || null,
        evidence_file_url: gasResult.evidenceFileUrl || null,
        evidence_description: evidence ? evidenceDescriptionInput : "-",
        attachment_name: evidence?.name || null,
        attachment_mime_type: evidence?.mimeType || null,
        attachment_size_bytes: evidence?.size || null,

        // เธขเธเน€เธฅเธดเธเธเธฒเธฃเนเธเน Supabase Storage เธชเธณเธซเธฃเธฑเธเธซเธฅเธฑเธเธเธฒเธเนเธซเธกเน
        attachment_bucket: null,
        attachment_path: null,
      })
      .select("*")
      .single();

    if (error) {
      await callGas(cfg.leaveGasUrl, {
        action: "leaveDiscardPending",
        secret: cfg.leaveGasSecret,
        workingDocumentId: gasResult.workingDocumentId,
        evidenceFileId: gasResult.evidenceFileId || "",
        requestFolderId: gasResult.requestFolderId,
      }).catch(() => undefined);

      throw new Error("เธเธฑเธเธ—เธถเธเนเธเธฅเธฒเนเธกเนเธชเธณเน€เธฃเนเธ");
    }

    await markDocumentNumberIssue(admin, {
      documentType: "LEAVE",
      referenceId: requestId,
      status: "COMPLETED",
    });

    await Promise.allSettled([
      notifyLeaveSubmitted({
        requestId: data.id,
        fullName: profile.full_name,
        position: profile.position || profile.role,
        leaveType,
        startDate: startDateValue,
        endDate: endDateValue,
        totalDays: totalWorkDays,
        reason,
        leaveNumber: issuedNumber.formattedNumber,
        submittedAt,
      }),
      notifyLeaveSubmittedTelegram({
        requestId: data.id,
        applicantProfileId: profile.id,
        applicantName: profile.full_name,
        leaveNumber: issuedNumber.formattedNumber,
        leaveType,
        startDate: startDateValue,
        endDate: endDateValue,
        totalDays: totalWorkDays,
        reason,
      }),
    ]).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            index === 0
              ? "LINE leave submitted notification error:"
              : "Telegram leave submitted notification error:",
            result.reason
          );
        }
      });
    });

    return NextResponse.json({
      ok: true,
      request: data,
      previewSequence: Number(approvedCount ?? 0) + 1,
      message: `เธชเนเธเนเธเธฅเธฒเน€เธฅเธเธ—เธตเน ${issuedNumber.formattedNumber} เน€เธเธทเนเธญเธฃเธญเธเธฒเธฃเธเธดเธเธฒเธฃเธ“เธฒเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง`,
    });
  } catch (error) {
    if (reservedAdmin && reservedRequestId) {
      await markDocumentNumberIssue(reservedAdmin, {
        documentType: "LEAVE",
        referenceId: reservedRequestId,
        status: "FAILED",
        failureReason: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await authorize(request);

    if (!authorization.ok) {
      return NextResponse.json(
        { ok: false, message: authorization.message },
        { status: authorization.status }
      );
    }

    const { admin, user, cfg } = authorization;

    let requestId = "";

    try {
      const body = (await request.json()) as { requestId?: unknown };
      requestId =
        typeof body.requestId === "string" ? body.requestId.trim() : "";
    } catch {
      requestId = "";
    }

    if (!requestId) {
      return NextResponse.json(
        { ok: false, message: "เนเธกเนเธเธเธฃเธซเธฑเธชเนเธเธฅเธฒเธ—เธตเนเธ•เนเธญเธเธเธฒเธฃเธฅเธ" },
        { status: 400 }
      );
    }

    const { data: leaveRequest, error: loadError } = await admin
      .from("leave_requests")
      .select(
        `
          id,
          user_id,
          status,
          working_document_id,
          drive_request_folder_id,
          evidence_file_id
        `
      )
      .eq("id", requestId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError) {
      throw new Error("เธ•เธฃเธงเธเธชเธญเธเธเนเธญเธกเธนเธฅเนเธเธฅเธฒเนเธกเนเธชเธณเน€เธฃเนเธ");
    }

    if (!leaveRequest) {
      return NextResponse.json(
        {
          ok: false,
          message: "เนเธกเนเธเธเนเธเธฅเธฒ เธซเธฃเธทเธญเธเธธเธ“เนเธกเนเธกเธตเธชเธดเธ—เธเธดเนเธฅเธเนเธเธฅเธฒเธฃเธฒเธขเธเธฒเธฃเธเธตเน",
        },
        { status: 404 }
      );
    }

    const hasDriveAssets = Boolean(
      leaveRequest.working_document_id ||
        leaveRequest.drive_request_folder_id ||
        leaveRequest.evidence_file_id
    );

    if (hasDriveAssets) {
      await callGas(cfg.leaveGasUrl, {
        action: "leaveDiscardPending",
        secret: cfg.leaveGasSecret,
        workingDocumentId: leaveRequest.working_document_id || "",
        evidenceFileId: leaveRequest.evidence_file_id || "",
        requestFolderId: leaveRequest.drive_request_folder_id || "",
      });
    }

    const { error: deleteError } = await admin
      .from("leave_requests")
      .delete()
      .eq("id", requestId)
      .eq("user_id", user.id);

    if (deleteError) {
      throw new Error("เธฅเธเธเนเธญเธกเธนเธฅเนเธเธฅเธฒเนเธกเนเธชเธณเน€เธฃเนเธ");
    }

    return NextResponse.json({
      ok: true,
      message: "เธฅเธเนเธเธฅเธฒเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง",
      requestId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "เธฅเธเนเธเธฅเธฒเนเธกเนเธชเธณเน€เธฃเนเธ",
      },
      { status: 500 }
    );
  }
}
