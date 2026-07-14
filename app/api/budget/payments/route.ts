import { NextResponse } from "next/server";
import { requireBudgetUser } from "@/lib/budget/supabase-server";
import {
  budgetAccessSummary,
  canManageAllBudget,
  canRecordBudgetPayment,
  DEPARTMENTS,
} from "@/lib/budget/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type GasUploadFile = {
  fileId?: string;
  fileName?: string;
  fileUrl?: string;
  mimeType?: string;
  fileSize?: number;
};

type GasResponse = {
  ok?: boolean;
  message?: string;
  files?: GasUploadFile[];
  trashedFileIds?: string[];
};

type ProjectPaymentStatusSync = {
  status: string;
  autoCompleted: boolean;
  budget: number;
  paid: number;
};

const PAYMENT_SELECT = `
  id,
  project_id,
  activity_id,
  payment_sequence,
  installment_label,
  description,
  amount,
  notes,
  status,
  paid_at,
  created_at,
  requester_id,
  requester_name_snapshot,
  created_by,
  updated_at,
  updated_by,
  cancelled_at,
  cancelled_by,
  cancellation_reason
`;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function gasConfig() {
  return {
    url:
      process.env.BUDGET_GAS_API_URL?.trim() ||
      process.env.BUDGET_GAS_WEB_APP_URL?.trim() ||
      "",
    secret: process.env.BUDGET_GAS_API_SECRET?.trim() || "",
  };
}

async function callBudgetGas(payload: Record<string, unknown>) {
  const config = gasConfig();

  if (!config.url) {
    throw new Error("ยังไม่ได้ตั้งค่า BUDGET_GAS_API_URL");
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      ...payload,
      secret: config.secret,
    }),
    cache: "no-store",
  });

  const responseText = await response.text();
  let result: GasResponse;

  try {
    result = JSON.parse(responseText) as GasResponse;
  } catch {
    throw new Error("Budget GAS ส่งข้อมูลกลับมาไม่ถูกต้อง");
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.message || "Budget GAS ทำงานไม่สำเร็จ");
  }

  return result;
}

async function getFinanceAccess(auth: Awaited<ReturnType<typeof requireBudgetUser>>) {
  if (!auth.ok) return false;
  return canRecordBudgetPayment(auth.profile);
}

async function loadPaymentAttachments(admin: any, paymentIds: string[]) {
  if (paymentIds.length === 0) return new Map<string, any>();

  const { data, error } = await admin
    .from("budget_payment_attachments")
    .select(
      "id,payment_id,drive_file_id,file_name,file_url,mime_type,file_size,is_active,uploaded_at"
    )
    .in("payment_id", paymentIds)
    .eq("is_active", true)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  const map = new Map<string, any>();
  for (const file of data ?? []) {
    if (!map.has(file.payment_id)) map.set(file.payment_id, file);
  }
  return map;
}

function mapPayment(
  row: any,
  projectName: string,
  activityName: string,
  creatorName: string,
  cancellerName: string,
  file: any
) {
  return {
    id: row.id,
    project_id: row.project_id,
    activity_id: row.activity_id || null,
    activity_name: activityName || null,
    details: row.description,
    payment_period: row.installment_label,
    amount: Number(row.amount || 0),
    evidence_name: file?.file_name || null,
    evidence_url: file?.file_url || null,
    note: row.notes,
    status: row.status,
    created_at: row.paid_at || row.created_at,
    requester_id: row.requester_id || null,
    requester_name: row.requester_name_snapshot || "-",
    created_by_name: creatorName || "-",
    cancelled_at: row.cancelled_at,
    cancelled_by_name: cancellerName || null,
    project_name: projectName,
  };
}


async function loadRequesterOptions(admin: any) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,full_name,role,position,work_permissions,departments,account_status")
    .eq("account_status", "active")
    .order("full_name", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .filter((profile: any) => {
      const role = text(profile.role);
      const permissions = Array.isArray(profile.work_permissions)
        ? profile.work_permissions
        : [];

      return (
        ["admin", "director"].includes(role) ||
        (Array.isArray(profile.departments) &&
          profile.departments.includes(DEPARTMENTS.budget)) ||
        permissions.includes("budget.procurement") ||
        permissions.includes("budget.finance") ||
        permissions.includes("budget.requester")
      );
    })
    .map((profile: any) => ({
      id: profile.id,
      fullName: text(profile.full_name),
      role: text(profile.role),
      position: text(profile.position),
      permissions: Array.isArray(profile.work_permissions)
        ? profile.work_permissions
        : [],
    }))
    .filter((profile: any) => profile.id && profile.fullName);
}

async function syncProjectPaymentStatus(
  admin: any,
  projectId: string,
  actorId: string
) {
  const [{ data: project, error: projectError }, { data: rows, error: paymentError }] =
    await Promise.all([
      admin
        .from("budget_projects")
        .select("id,status,approved_budget,budget_activities(id,approved_budget)")
        .eq("id", projectId)
        .maybeSingle(),
      admin
        .from("budget_payment_records")
        .select("amount")
        .eq("project_id", projectId)
        .eq("status", "active"),
    ]);

  if (projectError) throw projectError;
  if (paymentError) throw paymentError;
  if (!project) return null;

  const currentStatus = text(project.status);
  const hasActivePayments = (rows ?? []).length > 0;
  const paid = (rows ?? []).reduce(
    (sum: number, row: any) => sum + Number(row.amount || 0),
    0
  );
  const activities = Array.isArray(project.budget_activities)
    ? project.budget_activities
    : [];
  const activitiesBudget = activities.reduce(
    (sum: number, activity: any) =>
      sum + Number(activity.approved_budget || 0),
    0
  );
  const budget =
    activities.length > 0
      ? activitiesBudget
      : Number(project.approved_budget || 0);

  if (currentStatus === "เสร็จสิ้น") {
    return {
      status: currentStatus,
      autoCompleted: false,
      budget,
      paid,
    } satisfies ProjectPaymentStatusSync;
  }

  const nextStatus =
    budget > 0 && paid >= budget
      ? "เสร็จสิ้น"
      : hasActivePayments
        ? "เบิกจ่าย"
        : currentStatus === "เบิกจ่าย" || currentStatus === "กำลังเบิกจ่าย"
          ? "กำลังดำเนินการ"
          : currentStatus;

  if (nextStatus === currentStatus) {
    return {
      status: currentStatus,
      autoCompleted: false,
      budget,
      paid,
    } satisfies ProjectPaymentStatusSync;
  }

  const autoCompleted = nextStatus === "เสร็จสิ้น";

  const { error } = await admin
    .from("budget_projects")
    .update({
      status: nextStatus,
      updated_by: actorId,
    })
    .eq("id", projectId);

  if (error) throw error;

  return {
    status: nextStatus,
    autoCompleted,
    budget,
    paid,
  } satisfies ProjectPaymentStatusSync;
}

export async function GET(request: Request) {
  try {
    const auth = await requireBudgetUser(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    const canFinance = await getFinanceAccess(auth);

    const { data: rows, error } = await auth.admin
      .from("budget_payment_records")
      .select(PAYMENT_SELECT)
      .order("paid_at", { ascending: false });

    if (error) throw error;

    const projectIds = [...new Set((rows ?? []).map((row: any) => row.project_id))];
    const profileIds = [
      ...new Set(
        (rows ?? [])
          .flatMap((row: any) => [row.created_by, row.cancelled_by])
          .filter(Boolean)
      ),
    ];

    const activityIds = [...new Set((rows ?? []).map((row: any) => row.activity_id).filter(Boolean))];

    const [{ data: projects }, { data: activities }, { data: profiles }, attachments] = await Promise.all([
      projectIds.length
        ? auth.admin.from("budget_projects").select("id,name").in("id", projectIds)
        : Promise.resolve({ data: [] }),
      activityIds.length
        ? auth.admin.from("budget_activities").select("id,name").in("id", activityIds)
        : Promise.resolve({ data: [] }),
      profileIds.length
        ? auth.admin.from("profiles").select("id,full_name").in("id", profileIds)
        : Promise.resolve({ data: [] }),
      loadPaymentAttachments(
        auth.admin,
        (rows ?? []).map((row: any) => row.id)
      ),
    ]);

    const projectNames = new Map((projects ?? []).map((item: any) => [item.id, item.name]));
    const activityNames = new Map((activities ?? []).map((item: any) => [item.id, item.name]));
    const profileNames = new Map((profiles ?? []).map((item: any) => [item.id, item.full_name]));

    const requesterOptions = await loadRequesterOptions(auth.admin);

    return NextResponse.json({
      ok: true,
      requesterOptions,
      payments: (rows ?? []).map((row: any) =>
        mapPayment(
          row,
          projectNames.get(row.project_id) || "-",
          activityNames.get(row.activity_id) || "",
          profileNames.get(row.created_by) || "",
          profileNames.get(row.cancelled_by) || "",
          attachments.get(row.id)
        )
      ),
      currentUser: {
        id: auth.profile.id,
        fullName: auth.profile.full_name,
        role: auth.profile.role,
        ...budgetAccessSummary(auth.profile),
        canFinance,
        canManageAll: canManageAllBudget(auth.profile),
      },
    });
  } catch (error) {
    console.error("Budget payments GET error:", error);
    return NextResponse.json(
      { ok: false, message: "ไม่สามารถโหลดข้อมูลเบิกจ่ายจาก Supabase ได้" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let uploadedFileId = "";
  let insertedPaymentId = "";

  try {
    const auth = await requireBudgetUser(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    if (!(await getFinanceAccess(auth))) {
      return NextResponse.json(
        { ok: false, message: "เฉพาะเจ้าหน้าที่การเงิน ผู้บริหาร หรือผู้ดูแลระบบเท่านั้น" },
        { status: 403 }
      );
    }

    const form = await request.formData();
    const projectId = text(form.get("projectId"));
    const activityId = text(form.get("activityId"));
    const details = text(form.get("details"));
    const paymentPeriod = text(form.get("paymentPeriod"));
    const amount = Number(form.get("amount"));
    const note = text(form.get("note"));
    const requesterId = text(form.get("requesterId"));
    const evidenceValue = form.get("evidence");
    const evidence =
      evidenceValue instanceof File && evidenceValue.size > 0
        ? evidenceValue
        : null;

    if (!UUID_PATTERN.test(projectId)) {
      return NextResponse.json(
        { ok: false, message: "รหัสโครงการ Supabase ไม่ถูกต้อง กรุณารีเฟรชหน้า" },
        { status: 400 }
      );
    }

    if (!details) {
      return NextResponse.json(
        { ok: false, message: "กรุณากรอกรายละเอียดการจ่าย" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, message: "จำนวนเงินไม่ถูกต้อง" },
        { status: 400 }
      );
    }


    if (!UUID_PATTERN.test(requesterId)) {
      return NextResponse.json(
        { ok: false, message: "กรุณาเลือกผู้เบิกจ่ายจากรายการ" },
        { status: 400 }
      );
    }

    const requesterOptions = await loadRequesterOptions(auth.admin);
    const requester = requesterOptions.find(
      (item: any) => item.id === requesterId
    );

    if (!requester) {
      return NextResponse.json(
        { ok: false, message: "ผู้เบิกจ่ายไม่มีสิทธิ์งานงบประมาณหรือบัญชีไม่ใช้งาน" },
        { status: 400 }
      );
    }

    const { data: project, error: projectError } = await auth.admin
      .from("budget_projects")
      .select("id,name,budget_activities(id,name)")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !project) {
      return NextResponse.json(
        { ok: false, message: "ไม่พบโครงการใน Supabase" },
        { status: 404 }
      );
    }

    const projectActivities = Array.isArray(project.budget_activities)
      ? project.budget_activities
      : [];

    if (projectActivities.length > 0) {
      if (!UUID_PATTERN.test(activityId)) {
        return NextResponse.json(
          { ok: false, message: "กรุณาเลือกกิจกรรมของโครงการ" },
          { status: 400 }
        );
      }

      const activityExists = projectActivities.some(
        (activity: any) => activity.id === activityId
      );

      if (!activityExists) {
        return NextResponse.json(
          { ok: false, message: "กิจกรรมที่เลือกไม่อยู่ในโครงการนี้" },
          { status: 400 }
        );
      }
    } else if (activityId) {
      return NextResponse.json(
        { ok: false, message: "โครงการนี้ไม่มีกิจกรรมย่อย" },
        { status: 400 }
      );
    }

    if (evidence) {
      const maxSize = 10 * 1024 * 1024;
      const allowedTypes = new Set([
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
      ]);

      if (evidence.size > maxSize) {
        return NextResponse.json(
          { ok: false, message: "ไฟล์หลักฐานมีขนาดเกิน 10 MB" },
          { status: 400 }
        );
      }

      if (!allowedTypes.has(evidence.type)) {
        return NextResponse.json(
          { ok: false, message: "รองรับหลักฐาน PDF, PNG, JPG และ WEBP เท่านั้น" },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();

    const { data: payment, error: paymentError } = await auth.admin
      .from("budget_payment_records")
      .insert({
        project_id: project.id,
        activity_id: projectActivities.length > 0 ? activityId : null,
        installment_label: paymentPeriod || null,
        description: details,
        amount,
        notes: note || null,
        status: "active",
        paid_at: now,
        requester_id: requester.id,
        requester_name_snapshot: requester.fullName,
        created_by: auth.profile.id,
        updated_by: auth.profile.id,
      })
      .select(PAYMENT_SELECT)
      .single();

    if (paymentError) throw paymentError;
    insertedPaymentId = payment.id;

    let attachment: any = null;

    if (evidence) {
      const base64 = Buffer.from(await evidence.arrayBuffer()).toString("base64");
      const gasResult = await callBudgetGas({
        action: "uploadBudgetPaymentAttachments",
        projectId: project.id,
        paymentId: payment.id,
        attachments: [
          {
            name: evidence.name,
            mimeType: evidence.type,
            base64,
          },
        ],
      });

      const file = gasResult.files?.[0];
      if (!file?.fileId || !file.fileUrl) {
        throw new Error("Budget GAS ไม่คืนข้อมูลไฟล์หลักฐาน");
      }

      uploadedFileId = file.fileId;

      const { data: savedAttachment, error: attachmentError } = await auth.admin
        .from("budget_payment_attachments")
        .insert({
          payment_id: payment.id,
          drive_file_id: file.fileId,
          file_name: file.fileName || evidence.name,
          file_url: file.fileUrl,
          mime_type: file.mimeType || evidence.type || null,
          file_size: file.fileSize ?? evidence.size,
          uploaded_by: auth.profile.id,
          is_active: true,
        })
        .select(
          "id,payment_id,drive_file_id,file_name,file_url,mime_type,file_size,is_active,uploaded_at"
        )
        .single();

      if (attachmentError) throw attachmentError;
      attachment = savedAttachment;
    }

    const syncResult = await syncProjectPaymentStatus(
      auth.admin,
      payment.project_id,
      auth.profile.id
    );

    return NextResponse.json({
      ok: true,
      payment: mapPayment(
        payment,
        project.name,
        projectActivities.find((activity: any) => activity.id === payment.activity_id)?.name || "",
        auth.profile.full_name,
        "",
        attachment
      ),
      autoCompletedProject: Boolean(syncResult?.autoCompleted),
      projectStatus: syncResult?.status ?? null,
      message: syncResult?.autoCompleted
        ? "บันทึกรายการเบิกจ่ายแล้ว และโครงการเสร็จสิ้นอัตโนมัติ"
        : "บันทึกรายการเบิกจ่ายที่ Supabase แล้ว",
    });
  } catch (error) {
    console.error("Budget payments POST error:", error);

    try {
      const auth = await requireBudgetUser(request);
      if (auth.ok && insertedPaymentId) {
        await auth.admin
          .from("budget_payment_records")
          .delete()
          .eq("id", insertedPaymentId);
      }
    } catch {
      // Best-effort rollback.
    }

    if (uploadedFileId) {
      await callBudgetGas({
        action: "trashBudgetFiles",
        fileIds: [uploadedFileId],
      }).catch(() => undefined);
    }

    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "เกิดข้อผิดพลาดระหว่างบันทึกรายการเบิกจ่าย",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireBudgetUser(request);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, message: auth.message },
        { status: auth.status }
      );
    }

    if (!(await getFinanceAccess(auth))) {
      return NextResponse.json(
        { ok: false, message: "คุณไม่มีสิทธิ์ยกเลิกรายการเบิกจ่าย" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      action?: unknown;
      paymentId?: unknown;
      projectId?: unknown;
      reason?: unknown;
    };

    const action = text(body.action);
    const paymentId = text(body.paymentId);
    const projectId = text((body as { projectId?: unknown }).projectId);
    const reason = text(body.reason) || "ยกเลิกจากหน้าระบบเบิกจ่าย";

    if (action === "completeProject") {
      if (!UUID_PATTERN.test(projectId)) {
        return NextResponse.json(
          { ok: false, message: "รหัสโครงการไม่ถูกต้อง" },
          { status: 400 }
        );
      }

      const { data: project, error: projectError } = await auth.admin
        .from("budget_projects")
        .update({
          status: "เสร็จสิ้น",
          updated_by: auth.profile.id,
        })
        .eq("id", projectId)
        .select("id,name,status")
        .single();

      if (projectError) throw projectError;

      return NextResponse.json({
        ok: true,
        project,
        message: "กำหนดโครงการเป็นเสร็จสิ้นแล้ว",
      });
    }

    if (action !== "cancel" || !UUID_PATTERN.test(paymentId)) {
      return NextResponse.json(
        { ok: false, message: "คำสั่งไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: payment, error } = await auth.admin
      .from("budget_payment_records")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_by: auth.profile.id,
        cancellation_reason: reason,
        updated_at: now,
        updated_by: auth.profile.id,
      })
      .eq("id", paymentId)
      .eq("status", "active")
      .select(PAYMENT_SELECT)
      .single();

    if (error) throw error;

    const [{ data: project }, attachments] = await Promise.all([
      auth.admin
        .from("budget_projects")
        .select("id,name")
        .eq("id", payment.project_id)
        .maybeSingle(),
      loadPaymentAttachments(auth.admin, [payment.id]),
    ]);

    await syncProjectPaymentStatus(
      auth.admin,
      payment.project_id,
      auth.profile.id
    );

    return NextResponse.json({
      ok: true,
      payment: mapPayment(
        payment,
        project?.name || "-",
        "",
        "",
        auth.profile.full_name,
        attachments.get(payment.id)
      ),
      message: "ยกเลิกรายการเบิกจ่ายแล้ว",
    });
  } catch (error) {
    console.error("Budget payments PATCH error:", error);
    return NextResponse.json(
      { ok: false, message: "ยกเลิกรายการเบิกจ่ายไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
