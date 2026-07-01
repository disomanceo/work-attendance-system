import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ResetMode =
  | "attendance_only"
  | "leave_only"
  | "official_duty_only"
  | "memo_only"
  | "full_day";

type ResetItem = {
  id: string;
  label: string;
  detail: string;
};

type ResetSummary = {
  attendanceCount: number;
  leaveCount: number;
  officialDutyCount: number;
  memoCount: number;
  items: {
    attendance: ResetItem[];
    leave: ResetItem[];
    officialDuty: ResetItem[];
    memo: ResetItem[];
  };
};

type LeaveResetRow = {
  id: string;
  user_id: string;
  full_name?: string | null;
  leave_type: string | null;
  leave_number: string | null;
  start_date: string;
  end_date: string;
  document_number_issue_id: string | null;
};

type OfficialDutyResetRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  official_duty_number: string | null;
  subject: string | null;
  reason: string | null;
  duty_date: string;
  duty_end_date: string | null;
  document_number_issue_id: string | null;
};

type MemoResetRow = {
  id: string;
  full_name: string | null;
  memo_number: string | null;
  subject: string | null;
  submitted_at: string | null;
  attachment_bucket: string | null;
  attachment_path: string | null;
  document_number_issue_id: string | null;
};

type DeletedCounts = {
  attendance: number;
  leave: number;
  officialDuty: number;
  memo: number;
};

const RESET_MODES: ResetMode[] = [
  "attendance_only",
  "leave_only",
  "official_duty_only",
  "memo_only",
  "full_day",
];

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return null;
  }

  return { supabaseUrl, publishableKey, serviceRoleKey };
}

function getAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice("Bearer ".length).trim();
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseResetMode(value: unknown): ResetMode {
  return RESET_MODES.includes(value as ResetMode)
    ? (value as ResetMode)
    : "attendance_only";
}

function addOneDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function getMemoDayRange(workDate: string) {
  return {
    start: `${workDate}T00:00:00+07:00`,
    end: `${addOneDay(workDate)}T00:00:00+07:00`,
  };
}

function countForMode(summary: ResetSummary, mode: ResetMode) {
  if (mode === "attendance_only") return summary.attendanceCount;
  if (mode === "leave_only") return summary.leaveCount;
  if (mode === "official_duty_only") return summary.officialDutyCount;
  if (mode === "memo_only") return summary.memoCount;

  return (
    summary.attendanceCount +
    summary.leaveCount +
    summary.officialDutyCount +
    summary.memoCount
  );
}

function shouldLoadMode(currentMode: ResetMode, targetMode: ResetMode) {
  return currentMode === "full_day" || currentMode === targetMode;
}

function idsFrom<T extends { id: string }>(rows: T[]) {
  return rows.map((row) => row.id);
}

function documentIssueIdsFrom(
  rows: Array<{ document_number_issue_id: string | null }>
) {
  return rows
    .map((row) => row.document_number_issue_id)
    .filter((id): id is string => Boolean(id));
}

async function loadProfileNames(
  adminClient: SupabaseClient,
  userIds: string[],
  errorPrefix: string
) {
  const uniqueUserIds = Array.from(new Set(userIds));
  const profileNames = new Map<string, string>();

  if (uniqueUserIds.length === 0) {
    return profileNames;
  }

  const { data, error } = await adminClient
    .from("profiles")
    .select("id, full_name")
    .in("id", uniqueUserIds);

  if (error) {
    throw new Error(`${errorPrefix}: ${error.message}`);
  }

  for (const profile of data ?? []) {
    profileNames.set(String(profile.id), String(profile.full_name || ""));
  }

  return profileNames;
}

async function requireDirector(request: Request) {
  const config = getConfig();

  if (!config) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server",
        },
        { status: 500 }
      ),
    };
  }

  const token = getAccessToken(request);

  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      ),
    };
  }

  const authClient = createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 }
      ),
    };
  }

  const adminClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !["director", "admin"].includes(profile.role) ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "เฉพาะผู้อำนวยการหรือผู้ดูแลระบบเท่านั้น",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    adminClient,
    userId: user.id,
  };
}

async function loadAttendanceRows(
  adminClient: SupabaseClient,
  workDate: string
) {
  const { data, error } = await adminClient
    .from("attendance_records")
    .select("id, user_id, note")
    .eq("work_date", workDate)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`ตรวจสอบประวัติลงเวลาไม่สำเร็จ: ${error.message}`);
  }

  const userIds = Array.from(
    new Set((data ?? []).map((record) => String(record.user_id)))
  );
  const profileNames = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await adminClient
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    if (profileError) {
      throw new Error(`โหลดชื่อผู้ลงเวลาไม่สำเร็จ: ${profileError.message}`);
    }

    for (const profile of profiles ?? []) {
      profileNames.set(String(profile.id), String(profile.full_name || ""));
    }
  }

  return (data ?? []).map((record) => {
    const fullName =
      profileNames.get(String(record.user_id)) || "ไม่ระบุชื่อ";

    return {
      id: String(record.id),
      label: fullName,
      detail: record.note ? String(record.note) : "รายการลงเวลา",
    };
  });
}

async function loadLeaveRows(
  adminClient: SupabaseClient,
  workDate: string
): Promise<LeaveResetRow[]> {
  const { data, error } = await adminClient
    .from("leave_requests")
    .select(
      "id, user_id, leave_type, leave_number, start_date, end_date, document_number_issue_id"
    )
    .lte("start_date", workDate)
    .gte("end_date", workDate)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`ตรวจสอบใบลาไม่สำเร็จ: ${error.message}`);
  }

  const rows = (data ?? []) as LeaveResetRow[];
  const profileNames = await loadProfileNames(
    adminClient,
    rows.map((row) => row.user_id),
    "โหลดชื่อผู้ลาไม่สำเร็จ"
  );

  return rows.map((row) => ({
    ...row,
    full_name: profileNames.get(row.user_id) || null,
  }));
}

async function loadOfficialDutyRows(
  adminClient: SupabaseClient,
  workDate: string
): Promise<OfficialDutyResetRow[]> {
  const { data, error } = await adminClient
    .from("official_duty_requests")
    .select(
      "id, user_id, full_name, official_duty_number, subject, reason, duty_date, duty_end_date, document_number_issue_id"
    )
    .lte("duty_date", workDate)
    .gte("duty_end_date", workDate)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`ตรวจสอบใบไปราชการไม่สำเร็จ: ${error.message}`);
  }

  return (data ?? []) as OfficialDutyResetRow[];
}

async function loadMemoRows(
  adminClient: SupabaseClient,
  workDate: string
): Promise<MemoResetRow[]> {
  const range = getMemoDayRange(workDate);
  const { data, error } = await adminClient
    .from("memo_requests")
    .select(
      "id, full_name, memo_number, subject, submitted_at, attachment_bucket, attachment_path, document_number_issue_id"
    )
    .gte("submitted_at", range.start)
    .lt("submitted_at", range.end)
    .order("submitted_at", { ascending: true });

  if (error) {
    throw new Error(`ตรวจสอบบันทึกข้อความไม่สำเร็จ: ${error.message}`);
  }

  return (data ?? []) as MemoResetRow[];
}

function mapLeaveItems(rows: LeaveResetRow[]): ResetItem[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.leave_number || row.full_name || "ใบลา",
    detail: `${row.full_name || "ไม่ระบุชื่อ"} (${row.leave_type || "ลา"})`,
  }));
}

function mapOfficialDutyItems(rows: OfficialDutyResetRow[]): ResetItem[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.official_duty_number || row.full_name || "ไปราชการ",
    detail: `${row.full_name || "ไม่ระบุชื่อ"} (${
      row.subject || row.reason || "ไปราชการ"
    })`,
  }));
}

function mapMemoItems(rows: MemoResetRow[]): ResetItem[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.memo_number || row.full_name || "บันทึกข้อความ",
    detail: `${row.full_name || "ไม่ระบุชื่อ"} (${row.subject || "บันทึกข้อความ"})`,
  }));
}

async function getResetContext(
  adminClient: SupabaseClient,
  workDate: string,
  mode: ResetMode
) {
  const [attendanceItems, leaveRows, officialDutyRows, memoRows] =
    await Promise.all([
      shouldLoadMode(mode, "attendance_only")
        ? loadAttendanceRows(adminClient, workDate)
        : Promise.resolve([]),
      shouldLoadMode(mode, "leave_only")
        ? loadLeaveRows(adminClient, workDate)
        : Promise.resolve([]),
      shouldLoadMode(mode, "official_duty_only")
        ? loadOfficialDutyRows(adminClient, workDate)
        : Promise.resolve([]),
      shouldLoadMode(mode, "memo_only")
        ? loadMemoRows(adminClient, workDate)
        : Promise.resolve([]),
    ]);

  return {
    attendanceItems,
    leaveRows,
    officialDutyRows,
    memoRows,
    summary: {
      attendanceCount: attendanceItems.length,
      leaveCount: leaveRows.length,
      officialDutyCount: officialDutyRows.length,
      memoCount: memoRows.length,
      items: {
        attendance: attendanceItems,
        leave: mapLeaveItems(leaveRows),
        officialDuty: mapOfficialDutyItems(officialDutyRows),
        memo: mapMemoItems(memoRows),
      },
    } satisfies ResetSummary,
  };
}

async function cancelDocumentIssues(
  adminClient: SupabaseClient,
  documentIssueIds: string[],
  reason: string
) {
  if (documentIssueIds.length === 0) return;

  const { error } = await adminClient
    .from("document_number_issues")
    .update({
      issue_status: "CANCELLED",
      failure_reason: reason,
    })
    .in("id", Array.from(new Set(documentIssueIds)));

  if (error) {
    console.error("Update reset document number issues error:", error);
  }
}

async function removeMemoAttachments(
  adminClient: SupabaseClient,
  memoRows: MemoResetRow[]
) {
  const pathsByBucket = memoRows.reduce<Record<string, string[]>>((acc, row) => {
    if (!row.attachment_bucket || !row.attachment_path) return acc;
    acc[row.attachment_bucket] = acc[row.attachment_bucket] || [];
    acc[row.attachment_bucket].push(row.attachment_path);
    return acc;
  }, {});

  await Promise.all(
    Object.entries(pathsByBucket).map(async ([bucket, paths]) => {
      const { error } = await adminClient.storage.from(bucket).remove(paths);
      if (error) {
        console.error("Remove reset memo attachments error:", error);
      }
    })
  );
}

async function deleteAttendanceByDate(
  adminClient: SupabaseClient,
  workDate: string
) {
  const { error, count } = await adminClient
    .from("attendance_records")
    .delete({ count: "exact" })
    .eq("work_date", workDate);

  if (error) {
    throw new Error(`รีเซ็ตประวัติลงเวลาไม่สำเร็จ: ${error.message}`);
  }

  return count ?? 0;
}

async function deleteOfficialDutyAttendanceByDate(
  adminClient: SupabaseClient,
  workDate: string,
  officialDutyRows: OfficialDutyResetRow[]
) {
  const userIds = Array.from(new Set(officialDutyRows.map((row) => row.user_id)));
  if (userIds.length === 0) return 0;

  const { error, count } = await adminClient
    .from("attendance_records")
    .delete({ count: "exact" })
    .eq("work_date", workDate)
    .in("user_id", userIds)
    .eq("note", "ไปราชการ");

  if (error) {
    throw new Error(`ลบประวัติลงเวลาไปราชการไม่สำเร็จ: ${error.message}`);
  }

  return count ?? 0;
}

async function deleteRowsByIds(
  adminClient: SupabaseClient,
  table: "leave_requests" | "official_duty_requests" | "memo_requests",
  ids: string[],
  errorPrefix: string
) {
  if (ids.length === 0) return 0;

  const { error, count } = await adminClient
    .from(table)
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) {
    throw new Error(`${errorPrefix}: ${error.message}`);
  }

  return count ?? 0;
}

function buildResetMessage(mode: ResetMode, deleted: DeletedCounts) {
  if (mode === "attendance_only") {
    return `รีเซ็ตเฉพาะการลงเวลา ${deleted.attendance} รายการเรียบร้อยแล้ว`;
  }

  if (mode === "leave_only") {
    return `รีเซ็ตการลา ${deleted.leave} รายการเรียบร้อยแล้ว`;
  }

  if (mode === "official_duty_only") {
    return `รีเซ็ตการไปราชการ ${deleted.officialDuty} รายการ และประวัติลงเวลาไปราชการ ${deleted.attendance} รายการเรียบร้อยแล้ว`;
  }

  if (mode === "memo_only") {
    return `รีเซ็ตบันทึกข้อความ ${deleted.memo} รายการเรียบร้อยแล้ว`;
  }

  return `รีเซ็ตทั้งวันแล้ว: ลงเวลา ${deleted.attendance} รายการ, ใบลา ${deleted.leave} รายการ, ไปราชการ ${deleted.officialDuty} รายการ, บันทึกข้อความ ${deleted.memo} รายการ`;
}

export async function GET(request: Request) {
  const auth = await requireDirector(request);

  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const workDate = url.searchParams.get("date")?.trim() ?? "";
  const mode = parseResetMode(url.searchParams.get("mode"));

  if (!isValidDate(workDate)) {
    return NextResponse.json(
      { ok: false, message: "รูปแบบวันที่ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    const { summary } = await getResetContext(auth.adminClient, workDate, mode);

    return NextResponse.json({
      ok: true,
      date: workDate,
      count: summary.attendanceCount,
      ...summary,
    });
  } catch (error) {
    console.error("Count attendance reset records error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถตรวจสอบจำนวนข้อมูลได้",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireDirector(request);

  if (!auth.ok) {
    return auth.response;
  }

  let body: {
    date?: string;
    confirmation?: string;
    mode?: ResetMode;
  };

  try {
    body = (await request.json()) as {
      date?: string;
      confirmation?: string;
      mode?: ResetMode;
    };
  } catch {
    return NextResponse.json(
      { ok: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  const workDate = body.date?.trim() ?? "";
  const confirmation = body.confirmation?.trim() ?? "";
  const mode = parseResetMode(body.mode);

  if (!isValidDate(workDate)) {
    return NextResponse.json(
      { ok: false, message: "รูปแบบวันที่ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  if (confirmation !== "ยืนยัน") {
    return NextResponse.json(
      { ok: false, message: 'กรุณาพิมพ์คำว่า "ยืนยัน" ให้ตรง' },
      { status: 400 }
    );
  }

  try {
    const { summary, leaveRows, officialDutyRows, memoRows } =
      await getResetContext(auth.adminClient, workDate, mode);
    const total = countForMode(summary, mode);

    if (total === 0) {
      return NextResponse.json({
        ok: true,
        deletedCount: 0,
        deleted: {
          attendance: 0,
          leave: 0,
          officialDuty: 0,
          memo: 0,
        },
        message: "ไม่พบข้อมูลในวันที่เลือก",
      });
    }

    const deleted: DeletedCounts = {
      attendance: 0,
      leave: 0,
      officialDuty: 0,
      memo: 0,
    };

    if (mode === "leave_only" || mode === "full_day") {
      deleted.leave = await deleteRowsByIds(
        auth.adminClient,
        "leave_requests",
        idsFrom(leaveRows),
        "ลบใบลาไม่สำเร็จ"
      );
      await cancelDocumentIssues(
        auth.adminClient,
        documentIssueIdsFrom(leaveRows),
        `รีเซ็ตการลา วันที่ ${workDate}`
      );
    }

    if (mode === "official_duty_only" || mode === "full_day") {
      deleted.officialDuty = await deleteRowsByIds(
        auth.adminClient,
        "official_duty_requests",
        idsFrom(officialDutyRows),
        "ลบใบไปราชการไม่สำเร็จ"
      );
      await cancelDocumentIssues(
        auth.adminClient,
        documentIssueIdsFrom(officialDutyRows),
        `รีเซ็ตการไปราชการ วันที่ ${workDate}`
      );
      if (mode === "official_duty_only") {
        deleted.attendance += await deleteOfficialDutyAttendanceByDate(
          auth.adminClient,
          workDate,
          officialDutyRows
        );
      }
    }

    if (mode === "memo_only" || mode === "full_day") {
      deleted.memo = await deleteRowsByIds(
        auth.adminClient,
        "memo_requests",
        idsFrom(memoRows),
        "ลบบันทึกข้อความไม่สำเร็จ"
      );
      await removeMemoAttachments(auth.adminClient, memoRows);
      await cancelDocumentIssues(
        auth.adminClient,
        documentIssueIdsFrom(memoRows),
        `รีเซ็ตบันทึกข้อความ วันที่ ${workDate}`
      );
    }

    if (mode === "attendance_only" || mode === "full_day") {
      deleted.attendance += await deleteAttendanceByDate(
        auth.adminClient,
        workDate
      );
    }

    return NextResponse.json({
      ok: true,
      deletedCount:
        deleted.attendance +
        deleted.leave +
        deleted.officialDuty +
        deleted.memo,
      deleted,
      message: buildResetMessage(mode, deleted),
    });
  } catch (error) {
    console.error("Reset attendance history error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ไม่สามารถรีเซ็ตข้อมูลได้",
      },
      { status: 500 }
    );
  }
}
