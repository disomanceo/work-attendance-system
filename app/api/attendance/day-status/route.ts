import { NextResponse } from "next/server";
import { authorizeOfficialDuty } from "@/lib/official-duty-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeOfficialDuty(request);

    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const date = new URL(request.url).searchParams.get("date") ?? "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { ok: false, message: "วันที่ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const [{ data: attendance }, { data: leave }, { data: officialDuty }] =
      await Promise.all([
        auth.admin
          .from("attendance_records")
          .select("id,work_date,check_in_at")
          .eq("user_id", auth.user.id)
          .eq("work_date", date)
          .not("check_in_at", "is", null)
          .maybeSingle(),

        auth.admin
          .from("leave_requests")
          .select("id,status,start_date,end_date,leave_type")
          .eq("user_id", auth.user.id)
          .in("status", ["pending", "approved"])
          .lte("start_date", date)
          .gte("end_date", date)
          .limit(1)
          .maybeSingle(),

        auth.admin
          .from("official_duty_requests")
          .select("id,status,duty_date,duty_end_date")
          .eq("user_id", auth.user.id)
          .in("status", ["pending", "approved"])
          .lte("duty_date", date)
          .gte("duty_end_date", date)
          .limit(1)
          .maybeSingle(),
      ]);

    let message = "";

    if (attendance) {
      message = "วันนี้ได้ลงเวลาปฏิบัติงานแล้ว";
    } else if (leave) {
      message =
        leave.status === "approved"
          ? "วันนี้มีการลาที่อนุมัติแล้ว จึงไม่ต้องลงเวลา"
          : "วันนี้มีคำขอลารอพิจารณา จึงยังไม่ต้องลงเวลา";
    } else if (officialDuty) {
      message =
        officialDuty.status === "approved"
          ? "วันนี้ได้รับอนุญาตให้ไปราชการแล้ว จึงไม่ต้องลงเวลา"
          : "วันนี้มีคำขอไปราชการรอพิจารณา จึงยังไม่ต้องลงเวลา";
    }

    return NextResponse.json({
      ok: true,
      blocked: Boolean(attendance || leave || officialDuty),
      message,
      attendance: attendance ?? null,
      leave: leave ?? null,
      officialDuty: officialDuty ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "ตรวจสอบสถานะประจำวันไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
