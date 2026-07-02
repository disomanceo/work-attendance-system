import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Authorized = {
  ok: true;
  admin: SupabaseClient;
  profile: {
    id: string;
    role: string;
    account_status: string;
  };
};

type Unauthorized = {
  ok: false;
  status: number;
  message: string;
};

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return url && publishable && service
    ? { url, publishable, service }
    : null;
}

async function authorize(
  request: Request
): Promise<Authorized | Unauthorized> {
  const cfg = getConfig();

  if (!cfg) {
    return {
      ok: false,
      status: 500,
      message: "ตั้งค่า Environment Variables ของ Supabase ไม่ครบ",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : "";

  if (!token) {
    return {
      ok: false,
      status: 401,
      message: "กรุณาเข้าสู่ระบบ",
    };
  }

  const auth = createClient(cfg.url, cfg.publishable, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: authError,
  } = await auth.auth.getUser(token);

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
    };
  }

  const admin = createClient(cfg.url, cfg.service, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.account_status !== "active"
  ) {
    return {
      ok: false,
      status: 403,
      message: "บัญชียังไม่พร้อมใช้งาน",
    };
  }

  if (!["director", "admin"].includes(String(profile.role))) {
    return {
      ok: false,
      status: 403,
      message: "ไม่มีสิทธิ์จัดการเลขเอกสาร",
    };
  }

  return {
    ok: true,
    admin,
    profile: {
      id: String(profile.id),
      role: String(profile.role),
      account_status: String(profile.account_status),
    },
  };
}

function validateSeriesInput(input: {
  name: string;
  prefix: string;
  buddhistYear: number;
  startNumber: number;
  padding: number;
}) {
  if (input.name.length < 2 || input.name.length > 100) {
    return "ชื่อชุดเลขต้องมีความยาว 2–100 ตัวอักษร";
  }

  if (input.prefix.length > 30) {
    return "คำนำหน้าต้องไม่เกิน 30 ตัวอักษร";
  }

  if (
    !Number.isInteger(input.buddhistYear) ||
    input.buddhistYear < 2500 ||
    input.buddhistYear > 2700
  ) {
    return "ปี พ.ศ. ไม่ถูกต้อง";
  }

  if (
    !Number.isInteger(input.startNumber) ||
    input.startNumber < 1
  ) {
    return "เลขเริ่มต้นต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป";
  }

  if (
    !Number.isInteger(input.padding) ||
    input.padding < 1 ||
    input.padding > 8
  ) {
    return "จำนวนหลักต้องอยู่ระหว่าง 1–8";
  }

  return "";
}

function formatSeries(item: Record<string, unknown>) {
  const currentNumber = Number(item.current_number ?? 0);
  const startNumber = Number(item.start_number ?? 1);
  const padding = Number(item.padding ?? 3);
  const buddhistYear = Number(item.buddhist_year);
  const nextNumber = Math.max(currentNumber + 1, startNumber);
  const prefix = String(item.prefix ?? "").trim();
  const number = String(nextNumber).padStart(padding, "0");

  return {
    ...item,
    next_number: nextNumber,
    next_formatted_number:
      `${prefix ? `${prefix} ` : ""}${number}/${buddhistYear}`,
  };
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

    const { data, error } = await auth.admin
      .from("document_number_series")
      .select("*")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      series: (data ?? []).map((item) =>
        formatSeries(item as Record<string, unknown>)
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "โหลดชุดเลขเอกสารไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const body = await request.json();
    const code = String(body.code ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();
    const prefix = String(body.prefix ?? "").trim();
    const buddhistYear = Number(body.buddhistYear);
    const startNumber = Number(body.startNumber ?? 1);
    const padding = Number(body.padding ?? 3);
    const yearBasis = String(body.yearBasis ?? "ACADEMIC")
      .trim()
      .toUpperCase();

    if (!["ACADEMIC", "FISCAL"].includes(yearBasis)) {
      return NextResponse.json(
        {
          ok: false,
          message: "รูปแบบปีต้องเป็นปีการศึกษาหรือปีงบประมาณ",
        },
        { status: 400 }
      );
    }

    if (!/^[A-Z0-9_]{2,40}$/.test(code)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "รหัสประเภทต้องเป็น A–Z, 0–9 หรือ _ ความยาว 2–40 ตัวอักษร",
        },
        { status: 400 }
      );
    }

    const validationMessage = validateSeriesInput({
      name,
      prefix,
      buddhistYear,
      startNumber,
      padding,
    });

    if (validationMessage) {
      return NextResponse.json(
        { ok: false, message: validationMessage },
        { status: 400 }
      );
    }

    const { data, error } = await auth.admin
      .from("document_number_series")
      .insert({
        code,
        name,
        prefix,
        buddhist_year: buddhistYear,
        start_number: startNumber,
        current_number: startNumber - 1,
        padding,
        year_basis: yearBasis,
        mode: "TEST",
        is_active: true,
        created_by: auth.profile.id,
        updated_by: auth.profile.id,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(
        error.code === "23505"
          ? "มีชุดเลขประเภทนี้เปิดใช้งานอยู่แล้ว"
          : error.message
      );
    }

    return NextResponse.json({
      ok: true,
      series: formatSeries(data as Record<string, unknown>),
      message: "เพิ่มชุดเลขเอกสารเรียบร้อยแล้ว",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เพิ่มชุดเลขเอกสารไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorize(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const body = await request.json();
    const id = String(body.id ?? "").trim();
    const name = String(body.name ?? "").trim();
    const prefix = String(body.prefix ?? "").trim();
    const buddhistYear = Number(body.buddhistYear);
    const startNumber = Number(body.startNumber ?? 1);
    const padding = Number(body.padding ?? 3);
    const requestedYearBasis = String(body.yearBasis ?? "")
      .trim()
      .toUpperCase();

    if (!id) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบรหัสชุดเลขเอกสาร" },
        { status: 400 }
      );
    }

    const validationMessage = validateSeriesInput({
      name,
      prefix,
      buddhistYear,
      startNumber,
      padding,
    });

    if (validationMessage) {
      return NextResponse.json(
        { ok: false, message: validationMessage },
        { status: 400 }
      );
    }

    const { data: current, error: currentError } = await auth.admin
      .from("document_number_series")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      throw new Error(currentError.message);
    }

    if (!current) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบชุดเลขเอกสาร" },
        { status: 404 }
      );
    }

    const yearBasis =
      requestedYearBasis ||
      String(current.year_basis ?? "ACADEMIC").trim().toUpperCase();

    if (!["ACADEMIC", "FISCAL"].includes(yearBasis)) {
      return NextResponse.json(
        {
          ok: false,
          message: "รูปแบบปีต้องเป็นปีการศึกษาหรือปีงบประมาณ",
        },
        { status: 400 }
      );
    }

    const currentNumber = Number(current.current_number ?? 0);
    const hasIssuedNumbers =
      currentNumber >= Number(current.start_number ?? 1);

    if (
      hasIssuedNumbers &&
      startNumber !== Number(current.start_number)
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ชุดเลขนี้ออกเลขแล้ว จึงแก้เลขเริ่มต้นไม่ได้ กรุณาใช้การเริ่มชุดเลขใหม่",
        },
        { status: 409 }
      );
    }

    const { data, error } = await auth.admin
      .from("document_number_series")
      .update({
        name,
        prefix,
        buddhist_year: buddhistYear,
        start_number: startNumber,
        padding,
        year_basis: yearBasis,
        updated_by: auth.profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw new Error(
        error.code === "23505"
          ? "ค่าที่แก้ไขทำให้ชุดเลขซ้ำกับชุดที่มีอยู่"
          : error.message
      );
    }

    return NextResponse.json({
      ok: true,
      series: formatSeries(data as Record<string, unknown>),
      message: "บันทึกการแก้ไขชุดเลขเอกสารแล้ว",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "แก้ไขชุดเลขเอกสารไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
