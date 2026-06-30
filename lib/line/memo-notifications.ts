import {
  getLineAdminClient,
  getLineTarget,
  pushLineMessages,
  type LineMessage,
} from "./client";

function appUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : "http://localhost:3000";
}

function thaiDateTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function wasSent(key: string) {
  const admin = getLineAdminClient();
  if (!admin) return false;

  const { data } = await admin
    .from("line_notification_logs")
    .select("status")
    .eq("event_key", key)
    .maybeSingle();

  return data?.status === "sent";
}

async function logMemoLineResult(
  key: string,
  type: string,
  groupId: string,
  result: unknown,
  sent: boolean
) {
  const admin = getLineAdminClient();
  if (!admin) return;

  await admin.from("line_notification_logs").upsert(
    {
      event_key: key,
      event_type: type,
      group_id: groupId,
      status: sent ? "sent" : "failed",
      response_detail: result,
      sent_at: sent ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_key" }
  );
}

function memoFlex(input: {
  title: string;
  lines: string[];
  buttonLabel: string;
  buttonPath: string;
  color?: string;
}) {
  const color = input.color ?? "#1769E0";

  return {
    type: "flex",
    altText: input.title,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: color,
        contents: [
          {
            type: "text",
            text: input.title,
            color: "#FFFFFF",
            weight: "bold",
            size: "lg",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: input.lines.map((text) => ({
          type: "text",
          text,
          wrap: true,
          size: "sm",
          color: "#334155",
        })),
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color,
            action: {
              type: "uri",
              label: input.buttonLabel,
              uri: `${appUrl()}${input.buttonPath}`,
            },
          },
        ],
      },
    },
  } as LineMessage;
}

export async function notifyMemoSubmitted(input: {
  requestId: string;
  fullName: string;
  position: string | null;
  subject: string;
  reason: string;
  memoNumber: string | null;
  submittedAt: string | null;
}) {
  const target = await getLineTarget();
  if (!target.ok) return target;

  const key = `memo-submitted:${input.requestId}`;
  if (await wasSent(key)) return { ok: true as const, skipped: true };

  const message = memoFlex({
    title: "บันทึกข้อความใหม่",
    buttonLabel: "เปิดพิจารณา",
    buttonPath: "/admin/memo",
    lines: [
      `เลขที่: ${input.memoNumber || "-"}`,
      `ผู้ยื่น: ${input.fullName}`,
      `ตำแหน่ง: ${input.position || "-"}`,
      `เรื่อง: ${input.subject}`,
      `เหตุผล: ${input.reason}`,
      `ส่งเมื่อ: ${thaiDateTime(input.submittedAt)}`,
      "สถานะ: รอ ผอ. พิจารณา",
    ],
  });

  const result = await pushLineMessages(target.groupId, [message]);
  await logMemoLineResult(
    key,
    "memo_submitted",
    target.groupId,
    result,
    result.ok
  );
  return result;
}

export async function notifyMemoReviewed(input: {
  requestId: string;
  fullName: string;
  subject: string;
  memoNumber: string | null;
  status: string;
  reviewerName: string;
  reviewNote: string | null;
}) {
  const target = await getLineTarget();
  if (!target.ok) return target;

  const key = `memo-reviewed:${input.requestId}:${input.status}`;
  if (await wasSent(key)) return { ok: true as const, skipped: true };

  const statusLabel: Record<string, string> = {
    approved: "อนุมัติ",
    acknowledged: "รับทราบ",
    rejected: "ไม่อนุมัติ",
    revision: "ส่งกลับแก้ไข",
  };

  const message = memoFlex({
    title: `ผลพิจารณาบันทึกข้อความ: ${
      statusLabel[input.status] ?? input.status
    }`,
    buttonLabel: "เปิดดูรายการ",
    buttonPath: "/memo",
    color: input.status === "rejected" ? "#DC2626" : "#1769E0",
    lines: [
      `เลขที่: ${input.memoNumber || "-"}`,
      `ผู้ยื่น: ${input.fullName}`,
      `เรื่อง: ${input.subject}`,
      `ผลพิจารณา: ${statusLabel[input.status] ?? input.status}`,
      `ผู้พิจารณา: ${input.reviewerName}`,
      ...(input.reviewNote ? [`หมายเหตุ: ${input.reviewNote}`] : []),
    ],
  });

  const result = await pushLineMessages(target.groupId, [message]);
  await logMemoLineResult(
    key,
    "memo_reviewed",
    target.groupId,
    result,
    result.ok
  );
  return result;
}
