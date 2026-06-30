import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ResetMode = "attendance_only" | "full_day";

type ResetSummary = {
  attendanceCount: number;
  leaveCount: number;
  officialDutyCount: number;
};

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
  return value === "full_day" ? "full_day" : "attendance_only";
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
        {
          ok: false,
          message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
        },
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

async function countByDate(
  adminClient: SupabaseClient,
  workDate: string
): Promise<ResetSummary> {
  const [attendanceResult, leaveResult, officialDutyResult] =
    await Promise.all([
      adminClient
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("work_date", workDate),
      adminClient
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .lte("start_date", workDate)
        .gte("end_date", workDate),
      adminClient
        .from("official_duty_requests")
        .select("id", { count: "exact", head: true })
        .eq("duty_date", workDate),
    ]);

  if (attendanceResult.error) {
    throw new Error(
      `ตรวจสอบประวัติลงเวลาไม่สำเร็จ: ${attendanceResult.error.message}`
    );
  }

  if (leaveResult.error) {
    throw new Error(`ตรวจสอบใบลาไม่สำเร็จ: ${leaveResult.error.message}`);
  }

  if (officialDutyResult.error) {
    throw new Error(
      `ตรวจสอบใบไปราชการไม่สำเร็จ: ${officialDutyResult.error.message}`
    );
  }

  return {
    attendanceCount: attendanceResult.count ?? 0,
    leaveCount: leaveResult.count ?? 0,
    officialDutyCount: officialDutyResult.count ?? 0,
  };
}

export async function GET(request: Request) {
  const auth = await requireDirector(request);

  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const workDate = url.searchParams.get("date")?.trim() ?? "";

  if (!isValidDate(workDate)) {
    return NextResponse.json(
      { ok: false, message: "รูปแบบวันที่ไม่ถูกต้อง" },
      { status: 400 }
    );
  }

  try {
    const summary = await countByDate(auth.adminClient, workDate);

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
      {
        ok: false,
        message: 'กรุณาพิมพ์คำว่า "ยืนยัน" ให้ตรง',
      },
      { status: 400 }
    );
  }

  try {
    const summary = await countByDate(auth.adminClient, workDate);
    const total =
      mode === "full_day"
        ? summary.attendanceCount +
          summary.leaveCount +
          summary.officialDutyCount
        : summary.attendanceCount;

    if (total === 0) {
      return NextResponse.json({
        ok: true,
        deletedCount: 0,
        deleted: {
          attendance: 0,
          leave: 0,
          officialDuty: 0,
        },
        message: "ไม่พบข้อมูลในวันที่เลือก",
      });
    }

    let deletedLeave = 0;
    let deletedOfficialDuty = 0;

    if (mode === "full_day") {
      const { data: leaves, error: leaveListError } = await auth.adminClient
        .from("leave_requests")
        .select("id, document_number_issue_id")
        .lte("start_date", workDate)
        .gte("end_date", workDate);

      if (leaveListError) {
        throw new Error(`โหลดใบลาที่ต้องลบไม่สำเร็จ: ${leaveListError.message}`);
      }

      const documentIssueIds = (leaves ?? [])
        .map((leave) => leave.document_number_issue_id)
        .filter((id): id is string => Boolean(id));

      const { error: officialDutyDeleteError, count: officialDutyDeleted } =
        await auth.adminClient
          .from("official_duty_requests")
          .delete({ count: "exact" })
          .eq("duty_date", workDate);

      if (officialDutyDeleteError) {
        throw new Error(
          `ลบใบไปราชการไม่สำเร็จ: ${officialDutyDeleteError.message}`
        );
      }

      deletedOfficialDuty = officialDutyDeleted ?? 0;

      const { error: leaveDeleteError, count: leaveDeleted } =
        await auth.adminClient
          .from("leave_requests")
          .delete({ count: "exact" })
          .lte("start_date", workDate)
          .gte("end_date", workDate);

      if (leaveDeleteError) {
        throw new Error(`ลบใบลาไม่สำเร็จ: ${leaveDeleteError.message}`);
      }

      deletedLeave = leaveDeleted ?? 0;

      if (documentIssueIds.length > 0) {
        const { error: issueError } = await auth.adminClient
          .from("document_number_issues")
          .update({
            issue_status: "CANCELLED",
            failure_reason: `รีเซ็ตข้อมูลทั้งวัน ${workDate}`,
          })
          .in("id", documentIssueIds);

        if (issueError) {
          console.error("Update reset document number issues error:", issueError);
        }
      }
    }

    const { error: deleteError, count: attendanceDeleted } =
      await auth.adminClient
        .from("attendance_records")
        .delete({ count: "exact" })
        .eq("work_date", workDate);

    if (deleteError) {
      throw new Error(`รีเซ็ตประวัติลงเวลาไม่สำเร็จ: ${deleteError.message}`);
    }

    const deletedAttendance = attendanceDeleted ?? 0;

    return NextResponse.json({
      ok: true,
      deletedCount: deletedAttendance + deletedLeave + deletedOfficialDuty,
      deleted: {
        attendance: deletedAttendance,
        leave: deletedLeave,
        officialDuty: deletedOfficialDuty,
      },
      message:
        mode === "full_day"
          ? `รีเซ็ตข้อมูลทั้งวันแล้ว: ลงเวลา ${deletedAttendance} รายการ, ใบลา ${deletedLeave} รายการ, ไปราชการ ${deletedOfficialDuty} รายการ`
          : `รีเซ็ตประวัติการลงเวลา ${deletedAttendance} รายการเรียบร้อยแล้ว`,
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
