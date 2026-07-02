import {
  getLineAdminClient,
  getLineTarget,
  pushLineMessages,
  type LineMessage,
} from "./client";

const PURPLE = "#7C3AED";
const GREEN = "#16A34A";
const RED = "#DC2626";
const ORANGE = "#D97706";
const TEXT = "#0F172A";
const MUTED = "#64748B";

function thaiDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function thaiTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
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

function text(
  value: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type: "text",
    text: value || "-",
    size: "sm",
    color: TEXT,
    wrap: true,
    ...extra,
  };
}

function row(label: string, value: string) {
  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    alignItems: "flex-start",
    contents: [
      text(label, {
        size: "xs",
        color: MUTED,
        weight: "bold",
        flex: 0,
      }),
      text(value, {
        flex: 1,
        margin: "md",
      }),
    ],
  };
}

function statusBox(
  label: string,
  color: string,
  backgroundColor: string
) {
  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    paddingAll: "8px",
    cornerRadius: "8px",
    backgroundColor,
    contents: [
      text(label, {
        size: "xs",
        color,
        weight: "bold",
        align: "center",
      }),
    ],
  };
}

function memoFlex(input: {
  title: string;
  subtitle: string;
  rows: Array<{ label: string; value: string }>;
  status: string;
  color: string;
  statusColor: string;
  statusBackground: string;
}) {
  return {
    type: "flex",
    altText: input.title,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        backgroundColor: input.color,
        contents: [
          text(input.title, {
            color: "#FFFFFF",
            weight: "bold",
            size: "md",
          }),
          text(input.subtitle, {
            color: "#F5F3FF",
            size: "xxs",
            margin: "xs",
          }),
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        spacing: "none",
        contents: [
          ...input.rows.map((item) =>
            row(item.label, item.value)
          ),
          statusBox(
            input.status,
            input.statusColor,
            input.statusBackground
          ),
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
    title: "🟣 บันทึกข้อความใหม่",
    subtitle: "รอการพิจารณาจากผู้บริหาร",
    color: PURPLE,
    rows: [
      { label: "เลขที่", value: input.memoNumber || "-" },
      { label: "ผู้ยื่น", value: input.fullName },
      { label: "ตำแหน่ง", value: input.position || "-" },
      { label: "เรื่อง", value: input.subject || "-" },
      { label: "เหตุผล", value: input.reason || "-" },
      { label: "วันที่ยื่น", value: thaiDate(input.submittedAt) },
      {
        label: "เวลา",
        value: thaiTime(input.submittedAt) === "-"
          ? "-"
          : `${thaiTime(input.submittedAt)} น.`,
      },
    ],
    status: "สถานะ: รอ ผอ. พิจารณา",
    statusColor: "#6D28D9",
    statusBackground: "#F5F3FF",
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
    approved: "อนุมัติแล้ว",
    acknowledged: "รับทราบแล้ว",
    rejected: "ไม่อนุมัติ",
    revision: "ส่งกลับแก้ไข",
  };

  const label = statusLabel[input.status] ?? input.status;
  const approved =
    input.status === "approved" ||
    input.status === "acknowledged";
  const rejected = input.status === "rejected";

  const color = approved
    ? GREEN
    : rejected
      ? RED
      : ORANGE;

  const statusColor = approved
    ? "#15803D"
    : rejected
      ? "#B91C1C"
      : "#B45309";

  const statusBackground = approved
    ? "#F0FDF4"
    : rejected
      ? "#FEF2F2"
      : "#FFFBEB";

  const message = memoFlex({
    title: approved
      ? `✅ บันทึกข้อความ: ${label}`
      : rejected
        ? `❌ บันทึกข้อความ: ${label}`
        : `↩️ บันทึกข้อความ: ${label}`,
    subtitle: "ผลการพิจารณาบันทึกข้อความ",
    color,
    rows: [
      { label: "เลขที่", value: input.memoNumber || "-" },
      { label: "ผู้ยื่น", value: input.fullName },
      { label: "เรื่อง", value: input.subject || "-" },
      {
        label: "ผู้พิจารณา",
        value: input.reviewerName || "-",
      },
      ...(input.reviewNote
        ? [{ label: "หมายเหตุ", value: input.reviewNote }]
        : []),
    ],
    status: `ผลการพิจารณา: ${label}`,
    statusColor,
    statusBackground,
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
