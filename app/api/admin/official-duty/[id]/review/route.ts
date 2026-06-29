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

    let body: {
      action?: "approve" | "reject";
      reviewNote?: string;
    };

    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { ok: false, message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" },
        { status: 400 }
      );
    }

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
    const reviewNote = String(body.reviewNote ?? "").trim();

    if (!approved) {
      const { data: rejected, error: rejectError } = await auth.admin
        .from("official_duty_requests")
        .update({
          status: "rejected",
          reviewed_by: auth.user.id,
          reviewer_name: auth.profile.full_name,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote || null,
          attendance_record_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("*")
        .single();

      if (rejectError || !rejected) {
        throw new Error(
          rejectError?.message || "บันทึกผลไม่อนุญาตไม่สำเร็จ"
        );
      }

      void notifyOfficialDutyReviewed({
        requestId: rejected.id,
        fullName: rejected.full_name,
        dutyDate: rejected.duty_date,
        reason: rejected.reason,
        approved: false,
        reviewerName: auth.profile.full_name,
        reviewNote: rejected.review_note || "",
      }).catch((error) => {
        console.error("Official duty rejected notification error:", error);
      });

      return NextResponse.json({
        ok: true,
        request: rejected,
        message: "บันทึกผลไม่อนุญาตแล้ว",
      });
    }

    const [{ data: existing }, { data: activeLeave }] = await Promise.all([
      auth.admin
        .from("attendance_records")
        .select("id,check_in_at")
        .eq("user_id", item.user_id)
        .eq("work_date", item.duty_date)
        .maybeSingle(),

      auth.admin
        .from("leave_requests")
        .select("id,status")
        .eq("user_id", item.user_id)
        .in("status", ["pending", "approved"])
        .lte("start_date", item.duty_date)
        .gte("end_date", item.duty_date)
        .limit(1)
        .maybeSingle(),
    ]);

    if (existing?.check_in_at) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "ผู้ขอลงเวลาเข้าแล้ว จึงไม่สามารถอนุญาตไปราชการย้อนหลังในวันเดียวกันได้",
        },
        { status: 409 }
      );
    }

    if (activeLeave) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "วันที่ขอไปราชการมีคำขอลาหรือการลาที่อนุมัติแล้ว จึงไม่สามารถอนุญาตซ้ำได้",
        },
        { status: 409 }
      );
    }

    let attendanceRecordId: string | null = null;

    if (existing?.id) {
      const { data: updated, error } = await auth.admin
        .from("attendance_records")
        .update({
          check_in_at: null,
          check_out_at: null,
          check_in_status: null,
          check_out_status: null,
          note: "ไปราชการ",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id")
        .single();

      if (error || !updated) {
        throw new Error(
          error?.message || "บันทึกสถานะไปราชการไม่สำเร็จ"
        );
      }

      attendanceRecordId = updated.id;
    } else {
      const { data: inserted, error } = await auth.admin
        .from("attendance_records")
        .insert({
          user_id: item.user_id,
          work_date: item.duty_date,
          check_in_at: null,
          check_out_at: null,
          note: "ไปราชการ",
        })
        .select("id")
        .single();

      if (error || !inserted) {
        throw new Error(
          error?.message ||
            "สร้างรายการไปราชการในระบบลงเวลาไม่สำเร็จ"
        );
      }

      attendanceRecordId = inserted.id;
    }

    const { data: reviewed, error: reviewError } = await auth.admin
      .from("official_duty_requests")
      .update({
        status: "approved",
        reviewed_by: auth.user.id,
        reviewer_name: auth.profile.full_name,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote || null,
        attendance_record_id: attendanceRecordId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (reviewError || !reviewed) {
      throw new Error(
        reviewError?.message || "บันทึกผลการพิจารณาไม่สำเร็จ"
      );
    }

    void notifyOfficialDutyReviewed({
      requestId: reviewed.id,
      fullName: reviewed.full_name,
      dutyDate: reviewed.duty_date,
      reason: reviewed.reason,
      approved: true,
      reviewerName: auth.profile.full_name,
      reviewNote: reviewed.review_note || "",
    }).catch((error) => {
      console.error("Official duty approved notification error:", error);
    });

    return NextResponse.json({
      ok: true,
      request: reviewed,
      message: "อนุญาตให้ไปราชการและบันทึกสถานะลงเวลาแล้ว",
    });
  } catch (error) {
    console.error("Official duty review error:", error);

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "บันทึกผลการพิจารณาไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
