type C = Record<string, unknown>;

const GREEN = "#1B8A5A";
const GREEN_DARK = "#11603E";
const AMBER = "#D97706";
const RED = "#DC2626";
const BLUE = "#2563EB";
const TEXT = "#19352A";
const MUTED = "#63776E";
const BORDER = "#D8EAE0";

function t(value: string, extra: Record<string, unknown> = {}): C {
  return {
    type: "text",
    text: value,
    color: TEXT,
    size: "sm",
    wrap: true,
    ...extra,
  };
}

function row(label: string, value: string): C {
  return {
    type: "box",
    layout: "horizontal",
    margin: "md",
    contents: [
      t(label, { size: "xs", color: MUTED, flex: 3 }),
      t(value, { weight: "bold", align: "end", flex: 5 }),
    ],
  };
}

function bubble(
  title: string,
  subtitle: string,
  color: string,
  body: C[],
  button?: { label: string; url: string }
): C {
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "17px",
      backgroundColor: color,
      contents: [
        t(title, { color: "#FFFFFF", size: "lg", weight: "bold" }),
        t(subtitle, { color: "#E8FFF4", size: "xs", margin: "xs" }),
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "17px",
      contents: body,
    },
    ...(button
      ? {
          footer: {
            type: "box",
            layout: "vertical",
            paddingAll: "12px",
            contents: [
              {
                type: "button",
                style: "primary",
                height: "sm",
                color,
                action: {
                  type: "uri",
                  label: button.label,
                  uri: button.url,
                },
              },
            ],
          },
        }
      : {}),
  };
}

export function helpFlex() {
  return {
    type: "flex",
    altText: "คำสั่งระบบลงเวลาปฏิบัติงาน",
    contents: bubble(
      "🤖 คำสั่งระบบลงเวลา",
      "โรงเรียนวัดไผ่มุ้ง",
      GREEN,
      [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            t("ช่วยเหลือ", {
              weight: "bold",
              color: GREEN_DARK,
              flex: 2,
            }),
            t("แสดงรายการคำสั่ง", {
              size: "xs",
              color: MUTED,
              flex: 5,
            }),
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            t("สรุป", {
              weight: "bold",
              color: GREEN_DARK,
              flex: 2,
            }),
            t("รายงานการลงเวลาของวันนี้", {
              size: "xs",
              color: MUTED,
              flex: 5,
            }),
          ],
        },
        { type: "separator", margin: "lg", color: BORDER },
        t("รองรับ: คำสั่ง · เมนู · help · รายงาน · รายงานวันนี้", {
          size: "xxs",
          color: MUTED,
          margin: "lg",
        }),
      ]
    ),
  };
}

export function leaveSubmittedFlex(i: {
  fullName: string;
  position: string;
  leaveTypeLabel: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  leaveNumber: string;
  appUrl: string;
}) {
  return {
    type: "flex",
    altText: `มีใบลาใหม่จาก ${i.fullName}`,
    contents: bubble(
      "📝 มีใบลาใหม่",
      "รอการพิจารณาจากผู้บริหาร",
      AMBER,
      [
        t(i.fullName, { size: "xl", weight: "bold" }),
        t(i.position || "-", {
          size: "xs",
          color: MUTED,
          margin: "xs",
        }),
        { type: "separator", margin: "lg", color: BORDER },
        row("ประเภท", i.leaveTypeLabel),
        row("วันที่ลา", `${i.startDate} – ${i.endDate}`),
        row("จำนวน", `${i.totalDays} วัน`),
        row("เลขที่ใบลา", i.leaveNumber),
        {
          type: "box",
          layout: "vertical",
          margin: "lg",
          paddingAll: "12px",
          cornerRadius: "12px",
          backgroundColor: "#FFF7E8",
          contents: [
            t("เหตุผล", {
              size: "xs",
              color: AMBER,
              weight: "bold",
            }),
            t(i.reason, { margin: "sm" }),
          ],
        },
        t("สถานะ: รอพิจารณา", {
          margin: "lg",
          weight: "bold",
          color: AMBER,
        }),
      ],
      {
        label: "เปิดพิจารณาใบลา",
        url: `${i.appUrl}/leave`,
      }
    ),
  };
}

export function leaveReviewedFlex(i: {
  fullName: string;
  leaveTypeLabel: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  approved: boolean;
  reviewerName: string;
  reviewNote: string;
  leaveNumber: string;
  appUrl: string;
}) {
  const color = i.approved ? GREEN : RED;
  const status = i.approved ? "อนุมัติ" : "ไม่อนุมัติ";

  return {
    type: "flex",
    altText: `${status}ใบลาของ ${i.fullName}`,
    contents: bubble(
      i.approved ? "✅ อนุมัติใบลาแล้ว" : "❌ ไม่อนุมัติใบลา",
      "ผลการพิจารณาใบลา",
      color,
      [
        t(i.fullName, { size: "xl", weight: "bold" }),
        { type: "separator", margin: "lg", color: BORDER },
        row("ประเภท", i.leaveTypeLabel),
        row("วันที่ลา", `${i.startDate} – ${i.endDate}`),
        row("จำนวน", `${i.totalDays} วัน`),
        row("เลขที่ใบลา", i.leaveNumber),
        row("ผู้พิจารณา", i.reviewerName),
        t(`ผลการพิจารณา: ${status}`, {
          margin: "lg",
          weight: "bold",
          color,
        }),
        ...(i.reviewNote
          ? [
              t(`หมายเหตุ: ${i.reviewNote}`, {
                size: "xs",
                color: MUTED,
                margin: "sm",
              }),
            ]
          : []),
      ],
      {
        label: "เปิดระบบการลา",
        url: `${i.appUrl}/leave`,
      }
    ),
  };
}

type AttendanceStatus = "late" | "official" | "normal";
type NoteStatus = "sick" | "personal" | "official" | "missing";

function statusLabel(status: AttendanceStatus) {
  if (status === "late") return "[มาสาย]";
  if (status === "official") return "[ไปราชการ]";
  return "";
}

function statusColor(status: AttendanceStatus) {
  if (status === "late") return RED;
  if (status === "official") return BLUE;
  return MUTED;
}

function attendanceLine(line: {
  index: number;
  time: string;
  name: string;
  status: AttendanceStatus;
}): C {
  const label = statusLabel(line.status);

  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    alignItems: "center",
    contents: [
      t(`${line.index}.`, {
        size: "xs",
        color: MUTED,
        align: "end",
        flex: 1,
      }),
      t(`${line.time} น.`, {
        size: "xs",
        weight: "bold",
        color: GREEN_DARK,
        flex: 3,
      }),
      t(line.name, {
        size: "xs",
        flex: 6,
      }),
      t(label || " ", {
        size: "xxs",
        weight: label ? "bold" : "regular",
        color: statusColor(line.status),
        align: "end",
        flex: 3,
      }),
    ],
  };
}

function noteLine(line: {
  name: string;
  status: NoteStatus;
}): C {
  const labels: Record<NoteStatus, string> = {
    sick: "[ลาป่วย]",
    personal: "[ลากิจ]",
    official: "[ไปราชการ]",
    missing: "ยังไม่ได้ลงเวลา",
  };

  const colors: Record<NoteStatus, string> = {
    sick: AMBER,
    personal: AMBER,
    official: BLUE,
    missing: RED,
  };

  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    alignItems: "center",
    contents: [
      t(line.name, {
        size: "xs",
        flex: 7,
      }),
      t(labels[line.status], {
        size: "xs",
        color: colors[line.status],
        weight: "bold",
        align: "end",
        flex: 4,
      }),
    ],
  };
}

export function attendanceDailyFlex(i: {
  thaiDate: string;
  reportTime: string;
  attendance: Array<{
    index: number;
    time: string;
    name: string;
    status: AttendanceStatus;
  }>;
  noteLines: Array<{
    name: string;
    status: NoteStatus;
  }>;
  appUrl: string;
}) {
  const body: C[] = [
    t(i.thaiDate, { size: "md", weight: "bold" }),
    t(`ข้อมูล ณ เวลา ${i.reportTime} น.`, {
      size: "xs",
      color: MUTED,
      margin: "xs",
    }),
    { type: "separator", margin: "lg", color: BORDER },
    t("ลำดับการลงเวลา", {
      margin: "lg",
      weight: "bold",
      color: GREEN_DARK,
    }),
    ...(i.attendance.length
      ? i.attendance.map(attendanceLine)
      : [
          t("ยังไม่มีผู้ลงเวลา", {
            size: "xs",
            color: MUTED,
            margin: "sm",
          }),
        ]),
  ];

  if (i.noteLines.length > 0) {
    body.push(
      { type: "separator", margin: "lg", color: BORDER },
      t("หมายเหตุ", {
        margin: "lg",
        weight: "bold",
        color: GREEN_DARK,
      }),
      ...i.noteLines.map(noteLine)
    );
  } else {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      paddingAll: "10px",
      cornerRadius: "10px",
      backgroundColor: "#EAF8F0",
      contents: [
        t("✅ บุคลากรลงเวลาครบทุกคน", {
          size: "xs",
          color: GREEN_DARK,
          weight: "bold",
          align: "center",
        }),
      ],
    });
  }

  return {
    type: "flex",
    altText: `รายงานการลงเวลาปฏิบัติงาน ${i.thaiDate}`,
    contents: bubble(
      "📊 รายงานการลงเวลาปฏิบัติงาน",
      "โรงเรียนวัดไผ่มุ้ง",
      GREEN,
      body,
      {
        label: "เปิดรายงาน",
        url: `${i.appUrl}/admin/attendance`,
      }
    ),
  };
}
