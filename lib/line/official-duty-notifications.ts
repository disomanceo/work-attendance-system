import {
  getLineTarget,
  pushLineMessages,
  type LineMessage,
} from "./client";

const BLUE = "#2563EB";
const GREEN = "#16A34A";
const RED = "#DC2626";
const TEXT = "#0F172A";
const MUTED = "#64748B";

function thaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function thaiDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: "-", time: "-" };
  }

  return {
    date: new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date),
  };
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

function flex(input: {
  title: string;
  subtitle: string;
  color: string;
  rows: Array<{ label: string; value: string }>;
  status: string;
  statusColor: string;
  statusBackground: string;
}): LineMessage {
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
            color: "#EFF6FF",
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

export async function notifyOfficialDutySubmitted(i: {
  requestId: string;
  fullName: string;
  position: string;
  dutyDate: string;
  reason: string;
  hasAttachment: boolean;
  submittedAt: string;
}) {
  const target = await getLineTarget();
  if (!target.ok) return target;

  const submitted = thaiDateTime(i.submittedAt);

  const message = flex({
    title: "🔵 คำขอไปราชการใหม่",
    subtitle: "รอการพิจารณาจากผู้บริหาร",
    color: BLUE,
    rows: [
      { label: "ผู้ขอ", value: i.fullName },
      { label: "ตำแหน่ง", value: i.position || "-" },
      { label: "วันที่", value: thaiDate(i.dutyDate) },
      { label: "เหตุผล", value: i.reason || "-" },
      { label: "วันที่ยื่น", value: submitted.date },
      { label: "เวลา", value: submitted.time === "-" ? "-" : `${submitted.time} น.` },
      {
        label: "เอกสารแนบ",
        value: i.hasAttachment ? "มี" : "ไม่มี",
      },
    ],
    status: "สถานะ: รอ ผอ. พิจารณา",
    statusColor: "#1D4ED8",
    statusBackground: "#EFF6FF",
  });

  return pushLineMessages(target.groupId, [message]);
}

export async function notifyOfficialDutyReviewed(i: {
  requestId: string;
  fullName: string;
  dutyDate: string;
  reason: string;
  approved: boolean;
  reviewerName: string;
  reviewNote: string;
}) {
  const target = await getLineTarget();
  if (!target.ok) return target;

  const color = i.approved ? GREEN : RED;
  const status = i.approved
    ? "ผลการพิจารณา: อนุมัติแล้ว"
    : "ผลการพิจารณา: ไม่อนุมัติ";

  const message = flex({
    title: i.approved
      ? "✅ อนุมัติให้ไปราชการแล้ว"
      : "❌ ไม่อนุมัติให้ไปราชการ",
    subtitle: "ผลการพิจารณาคำขอไปราชการ",
    color,
    rows: [
      { label: "ผู้ขอ", value: i.fullName },
      { label: "วันที่", value: thaiDate(i.dutyDate) },
      { label: "เหตุผล", value: i.reason || "-" },
      {
        label: "ผู้พิจารณา",
        value: i.reviewerName || "-",
      },
      ...(i.reviewNote
        ? [{ label: "หมายเหตุ", value: i.reviewNote }]
        : []),
      ...(i.approved
        ? [
            {
              label: "การลงเวลา",
              value:
                'ระบบบันทึกสถานะ "ไปราชการ" แล้ว ไม่ต้องเช็กอิน',
            },
          ]
        : []),
    ],
    status,
    statusColor: i.approved ? "#15803D" : "#B91C1C",
    statusBackground: i.approved ? "#F0FDF4" : "#FEF2F2",
  });

  return pushLineMessages(target.groupId, [message]);
}
