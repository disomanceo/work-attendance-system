import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DocumentTypeFilter = "all" | "leave" | "official_duty" | "memo";

type DocumentIssueRow = {
  id: unknown;
  document_type: unknown;
  reference_id: unknown;
  formatted_number: unknown;
  running_number: unknown;
  buddhist_year: unknown;
  issue_status: unknown;
  issued_at: string | null;
  completed_at: string | null;
  metadata: unknown;
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  LEAVE: "ใบลา",
  OFFICIAL_DUTY: "ไปราชการ",
  OFFICIAL: "ไปราชการ",
  MEMO: "บันทึกข้อความ",
};

const FILTER_TO_TYPES: Record<Exclude<DocumentTypeFilter, "all">, string[]> = {
  leave: ["LEAVE"],
  official_duty: ["OFFICIAL_DUTY", "OFFICIAL"],
  memo: ["MEMO"],
};

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return url && publishable && service
    ? { url, publishable, service }
    : null;
}

async function authorize(request: Request) {
  const cfg = getConfig();

  if (!cfg) {
    return {
      ok: false as const,
      status: 500,
      message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!token) {
    return {
      ok: false as const,
      status: 401,
      message: "กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const auth = createClient(cfg.url, cfg.publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await auth.auth.getUser(token);

  if (authError || !user) {
    return {
      ok: false as const,
      status: 401,
      message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const admin = createClient(cfg.url, cfg.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.account_status !== "active") {
    return {
      ok: false as const,
      status: 403,
      message: "บัญชียังไม่พร้อมใช้งาน",
    };
  }

  return { ok: true as const, admin };
}

function readMetadataText(
  metadata: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

async function loadExistingReferenceIds(
  admin: SupabaseClient,
  table: "leave_requests" | "official_duty_requests" | "memo_requests",
  ids: string[]
) {
  if (ids.length === 0) return new Set<string>();

  const { data, error } = await admin
    .from(table)
    .select("id")
    .in("id", Array.from(new Set(ids)));

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((item) => String(item.id)));
}

async function filterExistingDocuments(
  admin: SupabaseClient,
  rows: DocumentIssueRow[]
) {
  const leaveIds: string[] = [];
  const officialDutyIds: string[] = [];
  const memoIds: string[] = [];

  for (const row of rows) {
    const referenceId = String(row.reference_id ?? "");
    const documentType = String(row.document_type ?? "");

    if (!referenceId) continue;
    if (documentType === "LEAVE") leaveIds.push(referenceId);
    if (["OFFICIAL_DUTY", "OFFICIAL"].includes(documentType)) {
      officialDutyIds.push(referenceId);
    }
    if (documentType === "MEMO") memoIds.push(referenceId);
  }

  const [leaveExisting, officialDutyExisting, memoExisting] =
    await Promise.all([
      loadExistingReferenceIds(admin, "leave_requests", leaveIds),
      loadExistingReferenceIds(
        admin,
        "official_duty_requests",
        officialDutyIds
      ),
      loadExistingReferenceIds(admin, "memo_requests", memoIds),
    ]);

  return rows.filter((row) => {
    const referenceId = String(row.reference_id ?? "");
    const documentType = String(row.document_type ?? "");

    if (documentType === "LEAVE") return leaveExisting.has(referenceId);
    if (["OFFICIAL_DUTY", "OFFICIAL"].includes(documentType)) {
      return officialDutyExisting.has(referenceId);
    }
    if (documentType === "MEMO") return memoExisting.has(referenceId);

    return true;
  });
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const url = new URL(request.url);
    const type = (url.searchParams.get("type") ??
      "all") as DocumentTypeFilter;
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 200), 1),
      500
    );

    let query = auth.admin
      .from("document_number_issues")
      .select(
        "id, document_type, reference_id, formatted_number, running_number, buddhist_year, issue_status, issued_at, completed_at, metadata"
      )
      .in("issue_status", ["ISSUED", "COMPLETED"])
      .order("buddhist_year", { ascending: false })
      .order("running_number", { ascending: false })
      .limit(limit);

    if (type !== "all" && FILTER_TO_TYPES[type]) {
      query = query.in("document_type", FILTER_TO_TYPES[type]);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const existingRows = await filterExistingDocuments(
      auth.admin,
      (data ?? []) as DocumentIssueRow[]
    );

    const documents = existingRows.map((item) => {
      const metadata =
        item.metadata && typeof item.metadata === "object"
          ? (item.metadata as Record<string, unknown>)
          : {};
      const documentType = String(item.document_type ?? "");
      const applicantName = readMetadataText(metadata, [
        "applicantName",
        "fullName",
        "name",
      ]);
      const subject =
        readMetadataText(metadata, [
          "subject",
          "reason",
          "leaveType",
          "dutyReason",
        ]) || DOCUMENT_TYPE_LABELS[documentType] || documentType;

      return {
        id: String(item.id),
        referenceId: String(item.reference_id),
        documentType,
        typeLabel: DOCUMENT_TYPE_LABELS[documentType] || documentType,
        formattedNumber: String(item.formatted_number ?? "-"),
        runningNumber: Number(item.running_number ?? 0),
        buddhistYear: Number(item.buddhist_year ?? 0),
        issuedAt: item.issued_at,
        completedAt: item.completed_at,
        status: String(item.issue_status ?? ""),
        applicantName,
        subject,
      };
    });

    return NextResponse.json({ ok: true, documents });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดทะเบียนเลขเอกสารไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
