type C = Record<string, unknown>;

const GREEN = "#1B8A5A";
const AMBER = "#D97706";
const RED = "#C2414C";
const TEXT = "#19352A";
const MUTED = "#63776E";

function t(value: string, extra: Record<string, unknown> = {}): C {
  return { type: "text", text: value, color: TEXT, size: "sm", wrap: true, ...extra };
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
  button: { label: string; url: string }
): C {
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      backgroundColor: color,
      contents: [
        t(title, { color: "#FFFFFF", size: "lg", weight: "bold" }),
        t(subtitle, { color: "#E8FFF4", size: "xs", margin: "sm" }),
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "20px", contents: body },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: [{
        type: "button",
        style: "primary",
        height: "sm",
        color,
        action: { type: "uri", label: button.label, uri: button.url },
      }],
    },
  };
}

function card(label: string, count: number, background: string, color: string): C {
  return {
    type: "box",
    layout: "vertical",
    flex: 1,
    paddingAll: "9px",
    cornerRadius: "12px",
    backgroundColor: background,
    contents: [
      t(label, { size: "xxs", color, align: "center", weight: "bold" }),
      t(String(count), { size: "xl", color, align: "center", weight: "bold", margin: "xs" }),
      t("คน", { size: "xxs", color, align: "center" }),
    ],
  };
}

export function leaveSubmittedFlex(i: {
  fullName: string; position: string; leaveTypeLabel: string; startDate: string;
  endDate: string; totalDays: number; reason: string; leaveNumber: string; appUrl: string;
}) {
  return {
    type: "flex",
    altText: `มีใบลาใหม่จาก ${i.fullName}`,
    contents: bubble("📝 มีใบลาใหม่", "รอการพิจารณาจากผู้บริหาร", AMBER, [
      t(i.fullName, { size: "xl", weight: "bold" }),
      t(i.position || "-", { size: "xs", color: MUTED, margin: "xs" }),
      { type: "separator", margin: "lg", color: "#D8EAE0" },
      row("ประเภท", i.leaveTypeLabel),
      row("วันที่ลา", `${i.startDate} – ${i.endDate}`),
      row("จำนวน", `${i.totalDays} วัน`),
      row("เลขที่ใบลา", i.leaveNumber),
      {
        type: "box", layout: "vertical", margin: "lg", paddingAll: "12px",
        cornerRadius: "12px", backgroundColor: "#FFF7E8",
        contents: [t("เหตุผล", { size: "xs", color: AMBER, weight: "bold" }), t(i.reason, { margin: "sm" })],
      },
      t("สถานะ: รอพิจารณา", { margin: "lg", weight: "bold", color: AMBER }),
    ], { label: "เปิดพิจารณาใบลา", url: `${i.appUrl}/leave` }),
  };
}

export function leaveReviewedFlex(i: {
  fullName: string; leaveTypeLabel: string; startDate: string; endDate: string;
  totalDays: number; approved: boolean; reviewerName: string; reviewNote: string;
  leaveNumber: string; appUrl: string;
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
        { type: "separator", margin: "lg", color: "#D8EAE0" },
        row("ประเภท", i.leaveTypeLabel),
        row("วันที่ลา", `${i.startDate} – ${i.endDate}`),
        row("จำนวน", `${i.totalDays} วัน`),
        row("เลขที่ใบลา", i.leaveNumber),
        row("ผู้พิจารณา", i.reviewerName),
        t(`ผลการพิจารณา: ${status}`, { margin: "lg", weight: "bold", color }),
        ...(i.reviewNote ? [t(`หมายเหตุ: ${i.reviewNote}`, { size: "xs", color: MUTED, margin: "sm" })] : []),
      ],
      { label: "เปิดระบบการลา", url: `${i.appUrl}/leave` }
    ),
  };
}

export function attendanceDailyFlex(i: {
  thaiDate: string; reportTime: string; onTime: number; late: number; presentTotal: number;
  sick: number; personal: number; missing: number; attendanceLines: string[];
  noteLines: string[]; appUrl: string;
}) {
  const body: C[] = [
    t(i.thaiDate, { size: "lg", weight: "bold" }),
    t(`ข้อมูล ณ เวลา ${i.reportTime} น.`, { size: "xs", color: MUTED, margin: "xs" }),
    {
      type: "box", layout: "horizontal", spacing: "sm", margin: "lg",
      contents: [card("มาตรงเวลา", i.onTime, "#EAF8F0", "#11603E"), card("มาสาย", i.late, "#FFF7E8", AMBER)],
    },
    {
      type: "box", layout: "horizontal", spacing: "sm", margin: "sm",
      contents: [
        card("ลาป่วย", i.sick, "#EFF6FF", "#2563EB"),
        card("ลากิจ", i.personal, "#F5F3FF", "#7C3AED"),
        card("ไม่ลงเวลา", i.missing, "#FFF1F2", RED),
      ],
    },
    t(`รวมมาปฏิบัติงาน ${i.presentTotal} คน`, { margin: "md", weight: "bold", color: "#11603E", align: "center" }),
    { type: "separator", margin: "lg", color: "#D8EAE0" },
    t("ลำดับการลงเวลา", { margin: "lg", weight: "bold", color: "#11603E" }),
    ...(i.attendanceLines.length ? i.attendanceLines.map(x => t(x, { size: "xs", margin: "sm" })) : [t("ยังไม่มีผู้ลงเวลา", { color: MUTED, margin: "sm" })]),
    { type: "separator", margin: "lg", color: "#D8EAE0" },
    t("หมายเหตุ", { margin: "lg", weight: "bold", color: "#11603E" }),
    ...(i.noteLines.length ? i.noteLines.map(x => t(`• ${x}`, { size: "xs", margin: "sm" })) : [t("ไม่มี", { color: MUTED, margin: "sm" })]),
  ];

  return {
    type: "flex",
    altText: `รายงานการลงเวลาปฏิบัติงาน ${i.thaiDate}`,
    contents: bubble("📊 รายงานการลงเวลาปฏิบัติงาน", "โรงเรียนวัดไผ่มุ้ง", GREEN, body, {
      label: "เปิดรายงานในระบบ",
      url: `${i.appUrl}/admin/attendance`,
    }),
  };
}
