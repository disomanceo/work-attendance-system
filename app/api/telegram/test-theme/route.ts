import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyTelegramProfiles } from "@/lib/telegram/private-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ThemeKey =
  | "document"
  | "leave"
  | "official-duty"
  | "memo"
  | "order"
  | "all";

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server environment variables are not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function isThemeKey(value: unknown): value is ThemeKey {
  return [
    "document",
    "leave",
    "official-duty",
    "memo",
    "order",
    "all",
  ].includes(String(value));
}

function samples(profileId: string) {
  return {
    document: {
      event: "document.assigned" as const,
      text: [
        "📄 <b>งานมอบหมายใหม่</b>",
        "",
        "เรื่อง: ขอความร่วมมือดำเนินกิจกรรมโรงเรียน",
        "ผู้มอบหมาย: ผู้อำนวยการโรงเรียน",
        "คำสั่งการ: โปรดดำเนินการและรายงานผล",
        "กำหนดส่ง: 15 กรกฎาคม 2569",
        "สถานะ: มอบหมายแล้ว",
      ].join("\n"),
      metadata: {
        source: "theme_preview",
        bookId: "preview",
      },
    },
    leave: {
      event: "leave.submitted" as const,
      text: [
        "🟡 <b>มีรายการใหม่รอพิจารณา</b>",
        "",
        "ประเภท: ลากิจ",
        "ผู้ยื่น: ครูตัวอย่าง",
        "ช่วงวันที่: 15 กรกฎาคม 2569",
        "เหตุผล: ติดต่อราชการส่วนตัว",
      ].join("\n"),
      metadata: {
        source: "theme_preview",
      },
    },
    "official-duty": {
      event: "official_duty.submitted" as const,
      text: [
        "🚗 <b>มีคำขอไปราชการรอพิจารณา</b>",
        "",
        "ผู้ยื่น: ครูตัวอย่าง",
        "เรื่อง: เข้าร่วมประชุมเชิงปฏิบัติการ",
        "สถานที่: สำนักงานเขตพื้นที่การศึกษา",
        "วันที่: 18 กรกฎาคม 2569",
      ].join("\n"),
      metadata: {
        source: "theme_preview",
      },
    },
    memo: {
      event: "memo.revision" as const,
      text: [
        "✏️ <b>ส่งกลับให้แก้ไข</b>",
        "",
        "เรื่อง: ขออนุมัติจัดกิจกรรม",
        "ผู้พิจารณา: ผู้อำนวยการโรงเรียน",
        "รายละเอียดที่ต้องแก้ไข: กรุณาเพิ่มเติมรายละเอียดงบประมาณ",
      ].join("\n"),
      metadata: {
        source: "theme_preview",
      },
    },
    order: {
      event: "order.approved" as const,
      text: [
        "✅ <b>คำสั่งได้รับการอนุมัติแล้ว</b>",
        "",
        "เลขที่: 12/2569",
        "เรื่อง: แต่งตั้งคณะกรรมการดำเนินงาน",
        "วันที่คำสั่ง: 10 กรกฎาคม 2569",
        "ผู้พิจารณา: ผู้อำนวยการโรงเรียน",
      ].join("\n"),
      metadata: {
        source: "theme_preview",
      },
    },
  };
}

export async function POST(request: Request) {
  try {
    const accessToken = bearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, message: "Missing access token" },
        { status: 401 }
      );
    }

    const supabase = adminClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, message: "Invalid session" },
        { status: 401 }
      );
    }

    let body: { theme?: unknown } = {};

    try {
      body = (await request.json()) as { theme?: unknown };
    } catch {
      body = {};
    }

    const theme: ThemeKey = isThemeKey(body.theme)
      ? body.theme
      : "all";
    const available = samples(user.id);
    const selected =
      theme === "all"
        ? Object.entries(available)
        : [[theme, available[theme]]] as const;

    const results = [];

    for (const [key, sample] of selected) {
      const result = await notifyTelegramProfiles({
        event: sample.event,
        recipientProfileIds: [user.id],
        actorProfileId: user.id,
        entityType: "telegram_theme_preview",
        entityId: `${user.id}:${key}`,
        text: sample.text,
        metadata: sample.metadata,
      });

      results.push({
        theme: key,
        ...result,
      });
    }

    const sent = results.reduce((sum, item) => sum + item.sent, 0);
    const delivered = sent > 0;

    return NextResponse.json(
      {
        ok: delivered,
        delivered,
        theme,
        results,
        message: delivered
          ? "Telegram theme preview sent"
          : "Telegram account is not linked or private chat is unavailable",
      },
      { status: delivered ? 200 : 409 }
    );
  } catch (error) {
    console.error("Telegram theme preview failed:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Cannot send Telegram theme preview",
      },
      { status: 500 }
    );
  }
}
