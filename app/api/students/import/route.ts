import { inflateRawSync } from "node:zlib";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { STUDENT_CLASS_LEVELS } from "@/lib/students/settings";
import {
  canManageStudentData,
  forbidden,
  loadStudentAccess,
  requireStudentAuth,
} from "@/lib/students/access";

const STUDENT_SELECT = "id, student_code, full_name, class_level, class_room, status, photo_file_id, photo_file_url, photo_mime_type, photo_uploaded_at, created_at, updated_at";

type ImportStudentRow = {
  student_code?: string;
  full_name: string;
  class_level: string;
  class_room?: string;
  status?: string;
};

const CLASS_PREFIX: Record<string, string> = {
  "อนุบาล 2": "K2",
  "อนุบาล 3": "K3",
  "ป.1": "P1",
  "ป.2": "P2",
  "ป.3": "P3",
  "ป.4": "P4",
  "ป.5": "P5",
  "ป.6": "P6",
};

function config() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return null;
  return { supabaseUrl, publishableKey, serviceRoleKey };
}

function tokenOf(request: Request) {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function requireActiveUser(request: Request) {
  const env = config();

  if (!env) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "ระบบยังไม่ได้ตั้งค่า Supabase ฝั่ง Server" },
        { status: 500 },
      ),
    };
  }

  const token = tokenOf(request);
  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบใหม่" },
        { status: 401 },
      ),
    };
  }

  const authClient = createClient(env.supabaseUrl, env.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
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
        { status: 401 },
      ),
    };
  }

  const adminClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role, account_status, departments")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.account_status !== "active") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "คุณไม่มีสิทธิ์ใช้งานข้อมูลนักเรียน" },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, user, profile, adminClient };
}

function xmlText(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function zipEntry(buffer: Buffer, wantedName: string) {
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index -= 1) {
    if (buffer.readUInt32LE(index) !== 0x06054b50) continue;

    const centralOffset = buffer.readUInt32LE(index + 16);
    let pointer = centralOffset;

    while (pointer < index && buffer.readUInt32LE(pointer) === 0x02014b50) {
      const method = buffer.readUInt16LE(pointer + 10);
      const compressedSize = buffer.readUInt32LE(pointer + 20);
      const fileNameLength = buffer.readUInt16LE(pointer + 28);
      const extraLength = buffer.readUInt16LE(pointer + 30);
      const commentLength = buffer.readUInt16LE(pointer + 32);
      const localOffset = buffer.readUInt32LE(pointer + 42);
      const name = buffer
        .subarray(pointer + 46, pointer + 46 + fileNameLength)
        .toString("utf8");

      if (name === wantedName) {
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

        if (method === 0) return compressed.toString("utf8");
        if (method === 8) return inflateRawSync(compressed).toString("utf8");
        throw new Error("ไฟล์ Word ใช้วิธีบีบอัดที่ระบบยังไม่รองรับ");
      }

      pointer += 46 + fileNameLength + extraLength + commentLength;
    }
  }

  throw new Error("ไม่พบเนื้อหาในไฟล์ Word");
}

function docxLines(buffer: Buffer) {
  const xml = zipEntry(buffer, "word/document.xml");
  const paragraphMatches = xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];
  return paragraphMatches.map(xmlText).filter(Boolean);
}

function textLines(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeClassLevel(value: string, fallback: string) {
  const normalized = value.replace(/\s+/g, "");

  for (const level of STUDENT_CLASS_LEVELS) {
    if (normalized.includes(level.replace(/\s+/g, ""))) return level;
  }

  const primary = normalized.match(/ป\.?([1-6])/);
  if (primary) return `ป.${primary[1]}`;

  const primaryLong = normalized.match(/ประถมศึกษาปีที่([1-6])/);
  if (primaryLong) return `ป.${primaryLong[1]}`;

  const kindergarten = normalized.match(/(?:อนุบาล|อ\.)([23])/);
  if (kindergarten) return `อนุบาล ${kindergarten[1]}`;

  return fallback;
}

function cleanName(value: string) {
  return value
    .replace(/^\s*\d+[\).\-\s]+/, "")
    .replace(/^(เด็กชาย|เด็กหญิง|นาย|นางสาว)\s+/, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRows(lines: string[], defaultClassLevel: string) {
  const rows: ImportStudentRow[] = [];
  let currentClassLevel = normalizeClassLevel(defaultClassLevel, STUDENT_CLASS_LEVELS[0]);

  for (const line of lines) {
    const normalizedClass = normalizeClassLevel(line, currentClassLevel);
    const looksLikeClassHeader =
      normalizedClass !== currentClassLevel ||
      /^ชั้น|^รายชื่อ|^ห้อง|^อนุบาล|^ป\./.test(line.replace(/\s+/g, ""));

    if (looksLikeClassHeader && line.length < 40) {
      currentClassLevel = normalizedClass;
      continue;
    }

    const parts = line
      .split(/\t|,|\|/)
      .map((part) => part.trim())
      .filter(Boolean);
    const candidate = parts.length >= 2 ? parts[parts.length - 1] : line;
    const fullName = cleanName(candidate);

    if (!fullName || fullName.length < 4) continue;
    if (/^\d+$/.test(fullName.replace(/\s+/g, ""))) continue;
    if (/^(บัญชีรายชื่อ|ภาคเรียน|เลขที่|เลขประจำตัว|เลขทะเบียน|ลำดับ|ชื่อ|นามสกุล|ชั้น|ห้อง|รวม|หมายเหตุ)/.test(fullName)) continue;
    if (!/[ก-ฮ]/.test(fullName)) continue;

    rows.push({
      student_code: parts.find((part) => /^\d{2,}$/.test(part)),
      full_name: fullName,
      class_level: normalizeClassLevel(line, currentClassLevel),
      class_room: "-",
      status: "active",
    });
  }

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.class_level}:${row.full_name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withCodes(rows: ImportStudentRow[]) {
  const counters = new Map<string, number>();
  const batchKey = Date.now().toString(36).slice(-4).toUpperCase();

  return rows.map((row) => {
    if (row.student_code) return row;

    const prefix = CLASS_PREFIX[row.class_level] || "ST";
    const next = (counters.get(prefix) || 0) + 1;
    counters.set(prefix, next);

    return {
      ...row,
      student_code: `${prefix}-${batchKey}-${String(next).padStart(3, "0")}`,
    };
  });
}

async function rowsFromForm(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const defaultClassLevel = text(formData.get("defaultClassLevel")) || STUDENT_CLASS_LEVELS[0];

  if (!(file instanceof File)) {
    throw new Error("กรุณาเลือกไฟล์รายชื่อนักเรียน");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const lines = name.endsWith(".docx")
    ? docxLines(buffer)
    : textLines(buffer.toString("utf8"));

  return withCodes(parseRows(lines, defaultClassLevel));
}

async function rowsFromJson(request: Request) {
  const body = (await request.json()) as { rows?: ImportStudentRow[] };
  return withCodes(
    (Array.isArray(body.rows) ? body.rows : [])
      .map((row) => ({
        student_code: text(row.student_code),
        full_name: text(row.full_name),
        class_level: normalizeClassLevel(text(row.class_level), STUDENT_CLASS_LEVELS[0]),
        class_room: text(row.class_room) || "-",
        status: text(row.status) || "active",
      }))
      .filter((row) => row.full_name && row.class_level),
  );
}

export async function POST(request: Request) {
  const auth = await requireStudentAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const commit = url.searchParams.get("commit") === "1";

  let rows: ImportStudentRow[];
  try {
    rows = request.headers.get("content-type")?.includes("application/json")
      ? await rowsFromJson(request)
      : await rowsFromForm(request);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "อ่านไฟล์นำเข้าไม่สำเร็จ",
      },
      { status: 400 },
    );
  }

  const access = await loadStudentAccess(auth.adminClient, auth.user.id, auth.profile);
  const deniedLevel = rows.find((row) => !canManageStudentData(access, row.class_level))?.class_level;
  if (deniedLevel) {
    return forbidden(`คุณไม่มีสิทธิ์นำเข้าข้อมูลนักเรียนชั้น ${deniedLevel}`);
  }

  if (!commit) {
    return NextResponse.json({ ok: true, rows, count: rows.length });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, message: "ไม่พบรายชื่อนักเรียนสำหรับนำเข้า" },
      { status: 400 },
    );
  }

  const codes = rows.map((row) => row.student_code || "").filter(Boolean);
  const { data: existingRows, error: existingError } = await auth.adminClient
    .from("students")
    .select("student_code")
    .in("student_code", codes);

  if (existingError) {
    return NextResponse.json(
      { ok: false, message: `ตรวจสอบข้อมูลซ้ำไม่สำเร็จ: ${existingError.message}` },
      { status: 500 },
    );
  }

  const existingCodes = new Set(
    ((existingRows ?? []) as Array<{ student_code: string | null }>).map((row) => row.student_code || ""),
  );
  const newRows = rows.filter((row) => row.student_code && !existingCodes.has(row.student_code));

  if (newRows.length === 0) {
    return NextResponse.json({
      ok: true,
      students: [],
      count: 0,
      message: "ไม่มีรายการใหม่สำหรับนำเข้า",
    });
  }

  const payload = newRows.map((row) => ({
    student_code: row.student_code || "",
    full_name: row.full_name,
    class_level: row.class_level,
    class_room: row.class_room || "-",
    status: row.status || "active",
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await auth.adminClient
    .from("students")
    .insert(payload)
    .select(STUDENT_SELECT);

  if (error) {
    return NextResponse.json(
      { ok: false, message: `นำเข้ารายชื่อนักเรียนไม่สำเร็จ: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    students: data ?? [],
    count: data?.length ?? rows.length,
    message: `นำเข้ารายชื่อนักเรียนแล้ว ${data?.length ?? rows.length} คน`,
  });
}
