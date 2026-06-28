import { NextResponse } from "next/server";
import { authorizeOfficialDuty } from "@/lib/official-duty-auth";
import { notifyOfficialDutyReviewed } from "@/lib/line/official-duty-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Params) {
  try {
    const auth = await authorizeOfficialDuty(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    if (!["director", "admin"].includes(auth.profile.role)) {
      return NextResponse.json(
        { ok: false, message: "ไม่มีสิทธิ์พิจารณาคำขอ" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await request.json() as {
      action?: "approve" | "reject";
      reviewNote?: string;
    };

    if (!["approve", "reject"].includes(String(body.action))) {
      return NextResponse.json(
        { ok: false, message: "คำสั่งพิจารณาไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const { data: item, error: loadError } = await auth.admin
      .from("official_duty_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (loadError || !item) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบคำขอไปราชการ" },
        { status: 404 }
      );
    }

    if (item.status !== "pending") {
      return NextResponse.json(
        { ok: false, message: "คำขอนี้ได้รับการพิจารณาแล้ว" },
        { status: 409 }
      );
    }

    const approved = body.action === "approve";
    let attendanceRecordId: string | null = null;

    if (approved) {
      const { data: existing } = await auth.admin
        .from("attendance_records")
        .select("id,check_in_at")
        .eq("user_id", item.user_id)
        .eq("work_date", item.duty_date)
        .maybeSingle();

      if (existing?.check_in_at) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "ผู้ขอลงเวลาเข้าแล้ว กรุณาตรวจสอบก่อนอนุมัติ เพื่อไม่ให้ข้อมูลรายงานคลาดเคลื่อน",
          },
          { status: 409 }
        );
      }

      if (existing?.id) {
        const { data: updated, error } = await auth.admin
          .from("attendance_records")
          .update({
            note: "ไปราชการ",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("id")
          .single();

        if (error) throw new Error("บันทึกสถานะไปราชการไม่สำเร็จ");
        attendanceRecordId = updated.id;
      } else {
        const { data: inserted, error } = await auth.admin
          .from("attendance_records")
          .insert({
            user_id: item.user_id,
            work_date: item.duty_date,
            note: "ไปราชการ",
          })
          .select("id")
          .single();

        if (error) throw new Error("สร้างรายการไปราชการในระบบลงเวลาไม่สำเร็จ");
        attendanceRecordId = inserted.id;
      }
    }

    const { data: reviewed, error: reviewError } = await auth.admin
      .from("official_duty_requests")
      .update({
        status: approved ? "approved" : "rejected",
        reviewed_by: auth.user.id,
        reviewer_name: auth.profile.full_name,
        reviewed_at: new Date().toISOString(),
        review_note: String(body.reviewNote ?? "").trim() || null,
        attendance_record_id: attendanceRecordId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (reviewError || !reviewed) {
      throw new Error("บันทึกผลการพิจารณาไม่สำเร็จ");
    }

    await notifyOfficialDutyReviewed({
      requestId: reviewed.id,
      fullName: reviewed.full_name,
      dutyDate: reviewed.duty_date,
      reason: reviewed.reason,
      approved,
      reviewerName: auth.profile.full_name,
      reviewNote: reviewed.review_note || "",
    }).catch(console.error);

    return NextResponse.json({
      ok: true,
      request: reviewed,
      message: approved
        ? "อนุญาตให้ไปราชการและบันทึกสถานะลงเวลาแล้ว"
        : "บันทึกผลไม่อนุญาตแล้ว",
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
