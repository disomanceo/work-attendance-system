import { NextResponse } from "next/server";
import {
  authorizeOfficialDuty,
  callOfficialDutyGas,
} from "@/lib/official-duty-auth";
import { notifyOfficialDutySubmitted } from "@/lib/line/official-duty-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("วันที่ไปราชการไม่ถูกต้อง");
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeOfficialDuty(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const { data, error } = await auth.admin
      .from("official_duty_requests")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error("โหลดประวัติการขอไปราชการไม่สำเร็จ");

    return NextResponse.json({ ok: true, requests: data ?? [] });
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
  try {
    const auth = await authorizeOfficialDuty(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const form = await request.formData();
    const dutyDate = validDate(String(form.get("dutyDate") ?? ""));
    const reason = String(form.get("reason") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();
    const attachment = form.get("attachment");

    if (reason.length < 3) {
      return NextResponse.json(
        { ok: false, message: "กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร" },
        { status: 400 }
      );
    }

    // ตรวจสอบข้อมูลลงเวลาเดิมก่อนสร้างคำขอ
    const [{ data: checkedIn }, { data: activeLeave }] = await Promise.all([
      auth.admin
        .from("attendance_records")
        .select("id,check_in_at")
        .eq("user_id", auth.user.id)
        .eq("work_date", dutyDate)
        .not("check_in_at", "is", null)
        .maybeSingle(),

      auth.admin
        .from("leave_requests")
        .select("id,status")
        .eq("user_id", auth.user.id)
        .in("status", ["pending", "approved"])
        .lte("start_date", dutyDate)
        .gte("end_date", dutyDate)
        .limit(1)
        .maybeSingle(),
    ]);

    if (checkedIn) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "วันที่เลือกได้ลงเวลาปฏิบัติงานแล้ว จึงไม่สามารถขอไปราชการได้",
        },
        { status: 409 }
      );
    }

    if (activeLeave) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "วันที่เลือกมีคำขอลาหรือการลาที่อนุมัติแล้ว จึงไม่สามารถขอไปราชการซ้ำได้",
        },
        { status: 409 }
      );
    }
    const { data: duplicate } = await auth.admin
      .from("official_duty_requests")
      .select("id,status")
      .eq("user_id", auth.user.id)
      .eq("duty_date", dutyDate)
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (duplicate) {
      return NextResponse.json(
        { ok: false, message: "มีคำขอไปราชการสำหรับวันนี้อยู่แล้ว" },
        { status: 409 }
      );
    }

    let uploaded: {
      fileId?: string;
      fileUrl?: string;
      fileName?: string;
      mimeType?: string;
    } = {};

    if (attachment instanceof File && attachment.size > 0) {
      if (attachment.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { ok: false, message: "ไฟล์แนบต้องไม่เกิน 5 MB" },
          { status: 400 }
        );
      }

      if (!ALLOWED_TYPES.has(attachment.type)) {
        return NextResponse.json(
          { ok: false, message: "รองรับเฉพาะ JPG, PNG และ PDF" },
          { status: 400 }
        );
      }

      const base64 = Buffer.from(await attachment.arrayBuffer()).toString("base64");

      uploaded = await callOfficialDutyGas(auth.cfg.gasUrl, {
        action: "uploadOfficialDutyAttachment",
        secret: auth.cfg.gasSecret,
        buddhistYear: Number(dutyDate.slice(0, 4)) + 543,
        fullName: auth.profile.full_name,
        dutyDate,
        originalName: attachment.name,
        mimeType: attachment.type,
        base64,
      }) as typeof uploaded;
    }

    const { data, error } = await auth.admin
      .from("official_duty_requests")
      .insert({
        user_id: auth.user.id,
        full_name: auth.profile.full_name,
        position: auth.profile.position || auth.profile.role,
        duty_date: dutyDate,
        reason,
        note: note || null,
        attachment_file_id: uploaded.fileId || null,
        attachment_file_url: uploaded.fileUrl || null,
        attachment_file_name: uploaded.fileName || null,
        attachment_mime_type: uploaded.mimeType || null,
        status: "pending",
      })
      .select("*")
      .single();

    if (error || !data) throw new Error("บันทึกคำขอไปราชการไม่สำเร็จ");

    await notifyOfficialDutySubmitted({
      requestId: data.id,
      fullName: data.full_name,
      position: data.position || "",
      dutyDate: data.duty_date,
      reason: data.reason,
      hasAttachment: Boolean(data.attachment_file_id),
    }).catch(console.error);

    return NextResponse.json({
      ok: true,
      request: data,
      message: "ส่งคำขอไปราชการเรียบร้อยแล้ว",
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

