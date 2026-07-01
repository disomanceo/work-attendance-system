import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return url && publishable && service
    ? { url, publishable, service }
    : null;
}

export async function GET(request: Request) {
  try {
    const cfg = config();
    if (!cfg) throw new Error("Environment Variables ยังไม่ครบ");

    const tokenHeader = request.headers.get("authorization") ?? "";
    const token = tokenHeader.startsWith("Bearer ")
      ? tokenHeader.slice(7).trim()
      : "";

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบ" },
        { status: 401 }
      );
    }

    const auth = createClient(cfg.url, cfg.publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
    } = await auth.auth.getUser(token);

    if (!user) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเข้าสู่ระบบ" },
        { status: 401 }
      );
    }

    const requestId = new URL(request.url).searchParams.get("requestId");

    if (!requestId) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบ requestId" },
        { status: 400 }
      );
    }

    const admin = createClient(cfg.url, cfg.service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [{ data: viewer }, { data: memo }] = await Promise.all([
      admin
        .from("profiles")
        .select("role, account_status")
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("memo_requests")
        .select(
          "user_id, attachment_bucket, attachment_path, attachment_file_name, attachment_mime_type"
        )
        .eq("id", requestId)
        .maybeSingle(),
    ]);

    if (!memo?.attachment_bucket || !memo.attachment_path) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบไฟล์แนบ" },
        { status: 404 }
      );
    }

    const canRead =
      memo.user_id === user.id ||
      (viewer?.account_status === "active" &&
        ["admin", "director"].includes(viewer.role));

    if (!canRead) {
      return NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์ดูไฟล์นี้" },
        { status: 403 }
      );
    }

    const { data, error } = await admin.storage
      .from(memo.attachment_bucket)
      .download(memo.attachment_path);

    if (error || !data) {
      throw new Error(error?.message || "โหลดไฟล์แนบไม่สำเร็จ");
    }

    const body = Buffer.from(await data.arrayBuffer());

    return new NextResponse(body, {
      headers: {
        "Content-Type": memo.attachment_mime_type || "application/octet-stream",
        "Content-Length": String(body.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          memo.attachment_file_name || "memo-attachment"
        )}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "โหลดไฟล์แนบไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
