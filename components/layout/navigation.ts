export type AppNavigationSection =
  | "home"
  | "personnel"
  | "budget"
  | "students"
  | "documents"
  | "review"
  | "account";

export type AppNavigationItem = {
  label: string;
  icon: string;
  href: string;
  section: AppNavigationSection;
  disabled?: boolean;
  match: (pathname: string) => boolean;
};

export function isManagerRole(role: string) {
  return role === "admin" || role === "director";
}

export function getReportHref(role: string) {
  return isManagerRole(role) ? "/admin/attendance" : "/attendance/history";
}

export function getAppNavigationItems(role: string): AppNavigationItem[] {
  const reportHref = getReportHref(role);

  const items: AppNavigationItem[] = [
    {
      label: "หน้าหลัก",
      icon: "⌂",
      href: "/attendance",
      section: "home",
      match: (value) => value === "/attendance",
    },
    {
      label: "การลงเวลาปฏิบัติงาน",
      icon: "◷",
      href: reportHref,
      section: "personnel",
      match: (value) =>
        value.startsWith("/admin/attendance") ||
        value.startsWith("/attendance/history"),
    },
    {
      label: "ขออนุญาตลาป่วย-ลากิจ",
      icon: "▣",
      href: "/leave",
      section: "personnel",
      match: (value) => value.startsWith("/leave"),
    },
    {
      label: "ขออนุญาตไปราชการ",
      icon: "✈",
      href: "/official-duty",
      section: "personnel",
      match: (value) => value.startsWith("/official-duty"),
    },
    {
      label: "บันทึกข้อความ",
      icon: "▤",
      href: "/memo",
      section: "personnel",
      match: (value) => value.startsWith("/memo"),
    },
    {
      label: "คำสั่ง",
      icon: "▥",
      href: "/orders",
      section: "personnel",
      match: (value) => value.startsWith("/orders"),
    },
    {
      label: "โครงการ / กิจกรรม",
      icon: "▦",
      href: "/budget/projects",
      section: "budget",
      match: (value) => value.startsWith("/budget/projects"),
    },
    {
      label: "การเบิกจ่าย",
      icon: "▧",
      href: "/budget/payments",
      section: "budget",
      match: (value) =>
        value.startsWith("/budget/payments") ||
        value.startsWith("/budget/disbursements"),
    },
    {
      label: "เช็คชื่อนักเรียน",
      icon: "✓",
      href: "/students/attendance",
      section: "students",
      match: (value) => value === "/students/attendance",
    },
    {
      label: "รายงานการมาเรียน",
      icon: "📅",
      href: "/students/attendance/report",
      section: "students",
      match: (value) => value.startsWith("/students/attendance/report"),
    },
    {
      label: "ข้อมูลนักเรียน",
      icon: "▥",
      href: "/students",
      section: "students",
      match: (value) => value === "/students",
    },
    {
      label: "ตั้งค่าห้องเรียน",
      icon: "⚙",
      href: "/students/settings",
      section: "students",
      match: (value) => value.startsWith("/students/settings"),
    },

    {
      label: "รายการหนังสือราชการ",
      icon: "▤",
      href: "/documents",
      section: "documents",
      match: (value) => value.startsWith("/documents"),
    },
    {
      label: "ข้อมูลส่วนตัว",
      icon: "♙",
      href: "/account/profile",
      section: "account",
      match: (value) => value.startsWith("/account"),
    },
  ];

  if (isManagerRole(role)) {
    items.push(
      {
        label: "พิจารณาใบลา",
        icon: "▣",
        href: "/admin/leave",
        section: "review",
        match: (value) => value.startsWith("/admin/leave"),
      },
      {
        label: "พิจารณาไปราชการ",
        icon: "▧",
        href: "/admin/official-duty",
        section: "review",
        match: (value) => value.startsWith("/admin/official-duty"),
      },
      {
        label: "พิจารณาบันทึกข้อความ",
        icon: "▤",
        href: "/admin/memo",
        section: "review",
        match: (value) => value.startsWith("/admin/memo"),
      },
      {
        label: "จัดการสมาชิก",
        icon: "👥",
        href: "/admin/members",
        section: "account",
        match: (value) => value.startsWith("/admin/members"),
      },
      {
        label: "ตั้งค่า",
        icon: "⚙",
        href: "/admin/settings",
        section: "account",
        match: (value) => value.startsWith("/admin/settings"),
      },
    );
  }

  return items;
}


