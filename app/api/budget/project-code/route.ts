import { NextResponse } from "next/server";
import { requireBudgetUser } from "@/lib/budget/supabase-server";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function validAcademicYear(value: unknown) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2500 && year <= 2700
    ? String(year)
    : "";
}

export async function GET(request: Request) {
  const auth = await requireBudgetUser(request);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status },
    );
  }

  const [settingsResult, projectsResult] = await Promise.all([
    auth.admin
      .from("attendance_settings")
      .select("active_academic_year")
      .eq("id", 1)
      .maybeSingle(),
    auth.admin
      .from("budget_projects")
      .select("project_code")
      .not("project_code", "is", null),
  ]);

  if (settingsResult.error) {
    console.error(
      "Load academic year setting error:",
      settingsResult.error,
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "ไม่สามารถโหลดปีการศึกษา กรุณารัน migration และตั้งค่าปีการศึกษาก่อน",
      },
      { status: 500 },
    );
  }

  const academicYear = validAcademicYear(
    settingsResult.data?.active_academic_year,
  );

  if (!academicYear) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "ยังไม่ได้กำหนดปีการศึกษา กรุณาไปที่เมนูตั้งค่าระบบ",
      },
      { status: 409 },
    );
  }

  if (projectsResult.error) {
    console.error(
      "Load used project codes error:",
      projectsResult.error,
    );

    return NextResponse.json(
      {
        ok: false,
        message: "ไม่สามารถตรวจสอบรหัสโครงการที่ใช้แล้วได้",
      },
      { status: 500 },
    );
  }

  const usedCodes = (projectsResult.data ?? [])
    .map((row: { project_code?: unknown }) =>
      text(row.project_code),
    )
    .filter((code: string) =>
      /^P[1-4]-\d{2}-\d{4}$/.test(code),
    );

  return NextResponse.json({
    ok: true,
    academicYear,
    usedCodes,
  });
}
