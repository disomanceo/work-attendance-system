import {
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

function thaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function flex(title: string, lines: string[], buttonLabel: string): LineMessage {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#2563EB",
        contents: [
          {
            type: "text",
            text: title,
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
        contents: lines.map((text) => ({
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
            color: "#2563EB",
            action: {
              type: "uri",
              label: buttonLabel,
              uri: `${appUrl()}/admin/official-duty`,
            },
          },
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
}) {
  const target = await getLineTarget();
  if (!target.ok) return target;

  const message = flex(
    "คำขอไปราชการใหม่",
    [
      `ผู้ขอ: ${i.fullName}`,
      `ตำแหน่ง: ${i.position || "-"}`,
      `วันที่: ${thaiDate(i.dutyDate)}`,
      `เหตุผล: ${i.reason}`,
      `เอกสารแนบ: ${i.hasAttachment ? "มี" : "ไม่มี"}`,
      "สถานะ: รอ ผอ. พิจารณา",
    ],
    "เปิดพิจารณา"
  );

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

  const message = flex(
    i.approved ? "อนุญาตให้ไปราชการแล้ว" : "ไม่อนุญาตให้ไปราชการ",
    [
      `ผู้ขอ: ${i.fullName}`,
      `วันที่: ${thaiDate(i.dutyDate)}`,
      `เหตุผล: ${i.reason}`,
      `ผู้พิจารณา: ${i.reviewerName}`,
      ...(i.reviewNote ? [`หมายเหตุ: ${i.reviewNote}`] : []),
      ...(i.approved
        ? ['ระบบบันทึกสถานะ "ไปราชการ" แล้ว ไม่ต้องเช็กอิน']
        : []),
    ],
    "เปิดดูรายการ"
  );

  return pushLineMessages(target.groupId, [message]);
}
