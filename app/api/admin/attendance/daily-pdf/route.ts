import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AttendanceRecord = {
  id: string;
  user_id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_status: string | null;
  check_out_status: string | null;
  note: string | null;
};

type Profile = {
  id: string;
  full_name: string;
  position: string | null;
  role: string;
  account_status: string;
  signature_file_id: string | null;
};

type GasPdfResponse = {
  ok: boolean;
  found?: boolean;
  message?: string;
  fileName?: string;
  size?: number | string | null;
  modifiedTime?: string | null;
  mimeType?: string;
  base64?: string;
  deleted?: boolean;
  replaced?: boolean;
  recordCount?: number;
};

type GasAssetResponse = {
  ok?: boolean;
  message?: string;
  base64?: string;
  mimeType?: string;
};

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gasUrl = process.env.GAS_DAILY_PDF_API_URL;
  const gasSecret = process.env.GAS_DAILY_PDF_SECRET;
  const profileGasUrl = process.env.GAS_PROFILE_UPLOAD_URL;
  const profileGasSecret = process.env.GAS_PROFILE_UPLOAD_SECRET;

  if (
    !supabaseUrl ||
    !publishableKey ||
    !serviceRoleKey ||
    !gasUrl ||
    !gasSecret ||
    !profileGasUrl ||
    !profileGasSecret
  ) {
    return null;
  }

  return {
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
    gasUrl,
    gasSecret,
    profileGasUrl,
    profileGasSecret,
  };
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: "ผู้ดูแลระบบ",
    director: "ผู้บริหาร",
    teacher: "ครู",
    staff: "เจ้าหน้าที่",
    janitor: "ภารโรง",
  };

  return labels[role] ?? role ?? "";
}

function formatThaiTime(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function attendanceStatus(record: AttendanceRecord) {
  if (!record.check_in_at) return "";
  if (record.check_in_status === "late") return "มาสาย";
  if (record.check_out_status === "early") return "ออกก่อนเวลา";
  if (!record.check_out_at) return "ยังไม่ลงเวลาออก";
  return "ปกติ";
}

function formatLateReason(note: string | null) {
  if (!note) return "";

  return note
    .trim()
    .replace(/^ขออนุญาตมาสาย\s*/u, "")
    .replace(/^เนื่องจาก\s*/u, "")
    .replace(/^เพราะ\s*/u, "")
    .trim();
}

async function authorizeAdmin(
  request: Request,
  config: NonNullable<ReturnType<typeof getConfig>>
) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!accessToken) {
    return {
      ok: false as const,
      status: 401,
      message: "กรุณาเข้าสู่ระบบ",
    };
  }

  const authClient = createClient(
    config.supabaseUrl,
    config.publishableKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      ok: false as const,
      status: 401,
      message: "Session ไม่ถูกต้องหรือหมดอายุ",
    };
  }

  const adminClient = createClient(
    config.supabaseUrl,
    config.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.account_status !== "active" ||
    !["admin", "director"].includes(profile.role)
  ) {
    return {
      ok: false as const,
      status: 403,
      message: "ไม่มีสิทธิ์จัดการรายงาน PDF",
    };
  }

  return {
    ok: true as const,
    adminClient,
  };
}

async function callGasGet(
  config: NonNullable<ReturnType<typeof getConfig>>,
  date: string,
  mode: "metadata" | "file" | "delete"
) {
  const url = new URL(config.gasUrl);
  url.searchParams.set(
    "action",
    mode === "delete" ? "deleteDailyPdf" : "dailyPdf"
  );
  url.searchParams.set("date", date);
  url.searchParams.set("mode", mode === "delete" ? "metadata" : mode);
  url.searchParams.set("secret", config.gasSecret);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
  });

  const text = await response.text();
  let result: GasPdfResponse;

  try {
    result = JSON.parse(text) as GasPdfResponse;
  } catch {
    throw new Error(
      "GAS ส่งข้อมูลกลับมาไม่ถูกต้อง กรุณาตรวจสอบการ Deploy เวอร์ชันล่าสุด"
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      result.message || "ไม่สามารถเรียกข้อมูล PDF จาก GAS ได้"
    );
  }

  return result;
}

async function getSignatureAsset(
  config: NonNullable<ReturnType<typeof getConfig>>,
  fileId: string | null | undefined
) {
  if (!fileId) {
    return null;
  }

  const response = await fetch(config.profileGasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      secret: config.profileGasSecret,
      action: "get",
      fileId,
    }),
    cache: "no-store",
    redirect: "follow",
  });

  const responseText = await response.text();
  let result: GasAssetResponse;

  try {
    result = JSON.parse(responseText) as GasAssetResponse;
  } catch {
    throw new Error(
      "GAS รูปภาพไม่ได้ส่งข้อมูลลายเซ็นกลับมาเป็น JSON"
    );
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(
      result.message || "ไม่สามารถโหลดลายเซ็นของผู้อำนวยการได้"
    );
  }

  if (!result.base64) {
    return null;
  }

  return {
    base64: result.base64,
    mimeType: result.mimeType || "image/png",
  };
}

async function buildDailyPdf(
  config: NonNullable<ReturnType<typeof getConfig>>,
  date: string
) {
  const adminClient = createClient(
    config.supabaseUrl,
    config.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data: attendanceData, error: attendanceError } =
    await adminClient
      .from("attendance_records")
      .select(
        `
          id,
          user_id,
          work_date,
          check_in_at,
          check_out_at,
          check_in_status,
          check_out_status,
          note
        `
      )
      .eq("work_date", date)
      .order("check_in_at", {
        ascending: true,
        nullsFirst: false,
      });

  if (attendanceError) {
    throw new Error(
      "ไม่สามารถโหลดข้อมูลการลงเวลาประจำวันที่เลือกได้"
    );
  }

  const attendance =
    (attendanceData ?? []) as AttendanceRecord[];

  const { data: profileData, error: profileError } =
    await adminClient
      .from("profiles")
      .select(
        "id, full_name, position, role, account_status, signature_file_id"
      )
      .eq("account_status", "active")
      .order("full_name", { ascending: true });

  if (profileError) {
    throw new Error("ไม่สามารถโหลดข้อมูลบุคลากรได้");
  }

  const profiles = (profileData ?? []) as Profile[];

  const directorProfile =
    profiles.find(
      (profile) =>
        profile.role === "director" &&
        Boolean(profile.signature_file_id)
    ) ??
    profiles.find((profile) => profile.role === "director") ??
    null;

  const directorSignature =
    directorProfile?.signature_file_id
      ? await getSignatureAsset(
          config,
          directorProfile.signature_file_id
        )
      : null;

  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile])
  );

  const attendanceMap = new Map(
    attendance.map((record) => [record.user_id, record])
  );

  const presentRecords = attendance
    .filter((record) => Boolean(record.check_in_at))
    .sort((a, b) => {
      const first = a.check_in_at ?? "9999";
      const second = b.check_in_at ?? "9999";
      return first.localeCompare(second);
    });

  const rows = presentRecords.map((record, index) => {
    const profile = profileMap.get(record.user_id);

    return {
      order: index + 1,
      fullName: profile?.full_name ?? "ไม่พบชื่อสมาชิก",
      position:
        profile?.position ||
        getRoleLabel(profile?.role ?? ""),
      checkIn: formatThaiTime(record.check_in_at),
      status: attendanceStatus(record),
      checkOut: formatThaiTime(record.check_out_at),
      signature: "",
      note:
        record.check_in_status === "late"
          ? formatLateReason(record.note)
          : "",
    };
  });

  const absentPeople = profiles
    .filter((profile) => !attendanceMap.get(profile.id)?.check_in_at)
    .map((profile) => {
      const record = attendanceMap.get(profile.id);
      const note = record?.note?.trim() ?? "";

      return {
        fullName: profile.full_name,
        reason: note,
      };
    });

  const noteItems = absentPeople
    .filter((person) => person.reason)
    .map(
      (person) =>
        `${person.fullName} (${person.reason})`
    );

  const normalizeReason = (value: string) =>
    value.replace(/\s+/g, "").toLowerCase();

  const sickLeave = absentPeople.filter((person) =>
    normalizeReason(person.reason).includes("ลาป่วย")
  ).length;

  const personalLeave = absentPeople.filter((person) =>
    normalizeReason(person.reason).includes("ลากิจ")
  ).length;

  const officialDuty = absentPeople.filter((person) =>
    normalizeReason(person.reason).includes("ไปราชการ")
  ).length;

  const late = presentRecords.filter(
    (record) => record.check_in_status === "late"
  ).length;

  const payload = {
    action: "buildDailyPdf",
    secret: config.gasSecret,
    date,
    rows,
    notes: noteItems,
    director: {
      fullName: directorProfile?.full_name ?? "",
      position:
        directorProfile?.position ||
        (directorProfile
          ? getRoleLabel(directorProfile.role)
          : ""),
    },
    directorSignature,
    summary: {
      total: profiles.length,
      present: presentRecords.length,
      sickLeave,
      personalLeave,
      officialDuty,
      late,
      absent: absentPeople.length,
    },
  };

  const response = await fetch(config.gasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
  });

  const responseText = await response.text();
  let result: GasPdfResponse;

  try {
    result = JSON.parse(responseText) as GasPdfResponse;
  } catch {
    throw new Error(
      "GAS ส่งผลการสร้าง PDF กลับมาไม่ถูกต้อง กรุณา Deploy doPost เวอร์ชันล่าสุด"
    );
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      result.message || "ไม่สามารถสร้าง PDF รายวันได้"
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
            "Environment Variables สำหรับ Supabase, GAS PDF หรือ GAS รูปภาพยังไม่ครบ",
        },
        { status: 500 }
      );
    }

    const authorization = await authorizeAdmin(
      request,
      config
    );

    if (!authorization.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: authorization.message,
        },
        {
          status: authorization.status,
        }
      );
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date")?.trim() ?? "";
    const modeValue =
      url.searchParams.get("mode")?.trim() ?? "metadata";

    if (!isValidDate(date)) {
      return NextResponse.json(
        {
          ok: false,
          message: "กรุณาระบุ date รูปแบบ YYYY-MM-DD",
        },
        { status: 400 }
      );
    }

    if (
      allowWrite &&
      (modeValue === "delete" || modeValue === "build")
    ) {
      const result =
        modeValue === "delete"
          ? await callGasGet(config, date, "delete")
          : await buildDailyPdf(
              config,
              date
            );

      return NextResponse.json(result);
    }

    if (
      modeValue !== "metadata" &&
      modeValue !== "file"
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "mode ต้องเป็น metadata, file, build หรือ delete",
        },
        { status: 400 }
      );
    }

    const mode = modeValue as "metadata" | "file";
    const result = await callGasGet(config, date, mode);

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
          message:
            result.message ||
            "ยังไม่พบรายงาน PDF ประจำวันที่เลือก",
        },
        { status: 404 }
      );
    }

    const body = Buffer.from(result.base64, "base64");
    const fileName =
      result.fileName || `daily-attendance-${date}.pdf`;

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
    console.error("Daily PDF API error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดระหว่างจัดการ PDF รายวัน",
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
