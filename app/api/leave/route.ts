import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notifyLeaveSubmitted } from "@/lib/line/notifications";

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
    throw new Error("รูปแบบวันที่ไม่ถูกต้อง");
  }

  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("วันที่ไม่ถูกต้อง");
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
      "ยังไม่ได้กำหนดปีงบประมาณ กรุณาให้ผู้อำนวยการตั้งค่าก่อน"
    );
  }

  const activeFiscalYear = Number(data.active_fiscal_year);

  if (
    !Number.isInteger(activeFiscalYear) ||
    activeFiscalYear < 2500 ||
    activeFiscalYear > 2700
  ) {
    throw new Error("ค่าปีงบประมาณไม่ถูกต้อง");
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

  if (error) throw new Error("โหลดวันหยุดไม่สำเร็จ");
  return new Set((data ?? []).map((item) => item.holiday_date as string));
}

function isWorkDay(date: Date, holidays: Set<string>) {
  // โรงเรียนอาจเปิดเรียนหรือปฏิบัติงานชดเชยในวันเสาร์–อาทิตย์
  // จึงนับวันเสาร์และวันอาทิตย์เป็นวันที่ยื่นลาได้ตามปกติ
  // ยกเว้นวันที่ผู้ดูแลกำหนดไว้ในตาราง leave_holidays เท่านั้น
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
        "Google Apps Script ตอบกลับช้าเกิน 50 วินาที กรุณาตรวจสอบ Deployment และสิทธิ์การเข้าถึง"
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
      "Google Apps Script ไม่ได้ตอบกลับเป็น JSON กรุณา Deploy เวอร์ชันล่าสุด"
    );
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "Google Apps Script ทำงานไม่สำเร็จ"
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
    throw new Error("ไม่พบข้อมูลลายเซ็น กรุณาอัปโหลดลายเซ็นใหม่");
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
      "Environment Variables ของ Supabase หรือ Google Apps Script ยังไม่ครบ"
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return { ok: false as const, status: 401, message: "กรุณาเข้าสู่ระบบ" };
  }

  const auth = createClient(cfg.url, cfg.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await auth.auth.getUser(token);

  if (error || !user) {
    return { ok: false as const, status: 401, message: "Session หมดอายุ" };
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
      message: "บัญชียังไม่พร้อมใช้งาน",
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

    if (error) throw new Error("โหลดประวัติการลาไม่สำเร็จ");

    const approved = (requests ?? []).filter(
      (item) => item.status === "approved" && item.fiscal_year === fiscalYear
    );

    const summary = {
      fiscalYear,
      sick: {
        times: approved.filter((item) => item.leave_type === "sick").length,
        days: approved
          .filter((item) => item.leave_type === "sick")
          .reduce((sum, item) => sum + Number(item.total_work_days), 0),
      },
      personal: {
        times: approved.filter((item) => item.leave_type === "personal").length,
        days: approved
          .filter((item) => item.leave_type === "personal")
          .reduce((sum, item) => sum + Number(item.total_work_days), 0),
      },
    };

    return NextResponse.json({ ok: true, requests, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let gasCreated:
    | {
        workingDocumentId?: string;
        requestFolderId?: string;
        evidenceFileId?: string;
      }
    | null = null;

  try {
    const authorization = await authorize(request);
    if (!authorization.ok) {
      return NextResponse.json(
        { ok: false, message: authorization.message },
        { status: authorization.status }
      );
    }

    const { admin, user, profile, cfg } = authorization;
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
        { ok: false, message: "กรุณาเลือกประเภทการลา" },
        { status: 400 }
      );
    }

    if (reason.length < 5) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร" },
        { status: 400 }
      );
    }

    if (!profile.signature_file_id) {
      return NextResponse.json(
        {
          ok: false,
          message: "กรุณาอัปโหลดลายเซ็นในหน้าข้อมูลส่วนตัวก่อนยื่นใบลา",
        },
        { status: 400 }
      );
    }

    const startDate = parseDate(startDateValue);
    const endDate = parseDate(endDateValue);

    if (endDate < startDate) {
      return NextResponse.json(
        { ok: false, message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มลา" },
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
        { ok: false, message: "ช่วงวันที่เลือกไม่มีวันทำการ" },
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
            "ใบลาย้อนหลังเกิน 3 วันทำการ ต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร",
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
          message: "ลาป่วยตั้งแต่ 3 วันทำการขึ้นไป ต้องแนบใบรับรองแพทย์",
        },
        { status: 400 }
      );
    }

    if (attachment) {
      if (evidenceDescriptionInput.length < 2) {
        return NextResponse.json(
          { ok: false, message: "กรุณาระบุหลักฐาน เช่น ใบรับรองแพทย์ หรือ รูปถ่าย" },
          { status: 400 }
        );
      }

      if (attachment.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { ok: false, message: "ไฟล์แนบต้องมีขนาดไม่เกิน 5 MB" },
          { status: 400 }
        );
      }

      if (!ALLOWED_MIME_TYPES.has(attachment.type)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "รุ่นนี้รองรับหลักฐานเฉพาะ JPG และ PNG เพื่อรวมไว้ใน PDF ฉบับเดียว",
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
          message: `วันที่ลาอยู่นอกช่วงปีงบประมาณ ${fiscalSettings.activeFiscalYear}`,
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

    if (countError) throw new Error("คำนวณครั้งที่ลาไม่สำเร็จ");

    const { data: overlaps, error: overlapError } = await admin
      .from("leave_requests")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["pending", "approved"])
      .lte("start_date", endDateValue)
      .gte("end_date", startDateValue)
      .limit(1);

    if (overlapError) throw new Error("ตรวจสอบช่วงวันลาซ้อนไม่สำเร็จ");

    if ((overlaps ?? []).length > 0) {
      return NextResponse.json(
        { ok: false, message: "ช่วงวันที่เลือกมีใบลาอยู่แล้ว" },
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

    const gasResult = (await callGas(cfg.leaveGasUrl, {
      action: "leaveCreatePending",
      secret: cfg.leaveGasSecret,
      roleKey: profile.role,
      fiscalYear,
      fullName: profile.full_name,
      position: profile.position || profile.role,
      leaveType,
      startDate: startDateValue,
      endDate: endDateValue,
      totalDays: totalWorkDays,
      reason,
      submittedAt: new Date().toISOString(),
      applicantSignatureBase64:
        `data:${applicantSignature.mimeType};base64,${applicantSignature.base64}`,
      evidenceName: evidence?.name || "",
      evidenceDescription: evidence ? evidenceDescriptionInput : "-",
      evidenceMimeType: evidence?.mimeType || "",
      evidenceBase64: evidence
        ? `data:${evidence.mimeType};base64,${evidence.base64}`
        : "",
    })) as GasPendingResponse;

    if (
      !gasResult.leaveNumber ||
      !gasResult.workingDocumentId ||
      !gasResult.requestFolderId
    ) {
      throw new Error("GAS ไม่คืนข้อมูลเอกสารใบลาที่จำเป็น");
    }

    gasCreated = {
      workingDocumentId: gasResult.workingDocumentId,
      requestFolderId: gasResult.requestFolderId,
      evidenceFileId: gasResult.evidenceFileId,
    };

    const requestId = crypto.randomUUID();

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

        leave_number: gasResult.leaveNumber,
        working_document_id: gasResult.workingDocumentId,
        working_document_url: gasResult.workingDocumentUrl || null,
        drive_request_folder_id: gasResult.requestFolderId,
        evidence_file_id: gasResult.evidenceFileId || null,
        evidence_file_url: gasResult.evidenceFileUrl || null,
        evidence_description: evidence ? evidenceDescriptionInput : "-",
        attachment_name: evidence?.name || null,
        attachment_mime_type: evidence?.mimeType || null,
        attachment_size_bytes: evidence?.size || null,

        // ยกเลิกการใช้ Supabase Storage สำหรับหลักฐานใหม่
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

      throw new Error("บันทึกใบลาไม่สำเร็จ");
    }

    await notifyLeaveSubmitted({
      requestId: data.id,
      fullName: profile.full_name,
      position: profile.position || profile.role,
      leaveType,
      startDate: startDateValue,
      endDate: endDateValue,
      totalDays: totalWorkDays,
      reason,
      leaveNumber: gasResult.leaveNumber,
    }).catch((lineError) => {
      console.error("LINE leave submitted notification error:", lineError);
    });

    return NextResponse.json({
      ok: true,
      request: data,
      previewSequence: Number(approvedCount ?? 0) + 1,
      message: `ส่งใบลาเลขที่ ${gasResult.leaveNumber} เพื่อรอการพิจารณาเรียบร้อยแล้ว`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
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
        { ok: false, message: "ไม่พบรหัสใบลาที่ต้องการลบ" },
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
      throw new Error("ตรวจสอบข้อมูลใบลาไม่สำเร็จ");
    }

    if (!leaveRequest) {
      return NextResponse.json(
        {
          ok: false,
          message: "ไม่พบใบลา หรือคุณไม่มีสิทธิ์ลบใบลารายการนี้",
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
      throw new Error("ลบข้อมูลใบลาไม่สำเร็จ");
    }

    return NextResponse.json({
      ok: true,
      message: "ลบใบลาเรียบร้อยแล้ว",
      requestId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "ลบใบลาไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}

