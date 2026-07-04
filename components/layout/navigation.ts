export type AppNavigationSection =
  | "home"
  | "personnel"
  | "budget"
  | "documents"
  | "review"
  | "account";

export type AppNavigationItem = {
  label: string;
  icon: string;
  href: string;
  section: AppNavigationSection;
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
      icon: "◷",
      href: "/attendance",
      section: "home",
      match: (value) => value === "/attendance",
    },
    {
      label: "การลงเวลาปฏิบัติงาน",
      icon: "▣",
      href: reportHref,
      section: "personnel",
      match: (value) =>
        value.startsWith("/admin/attendance") ||
        value.startsWith("/attendance/history"),
    },
    {
      label: "ขออนุญาตลาป่วย-ลากิจ",
      icon: "▤",
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
      label: "ภาพรวมงบประมาณ",
      icon: "▨",
      href: "/budget",
      section: "budget",
      match: (value) => value === "/budget",
    },
    {
      label: "แผนงบประมาณ",
      icon: "▤",
      href: "/budget/plans",
      section: "budget",
      match: (value) => value.startsWith("/budget/plans"),
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
      icon: "▥",
      href: "/budget/disbursements",
      section: "budget",
      match: (value) => value.startsWith("/budget/disbursements"),
    },
    {
      label: "รายงานงบประมาณ",
      icon: "▧",
      href: "/budget/reports",
      section: "budget",
      match: (value) => value.startsWith("/budget/reports"),
    },
    {
      label: "บันทึกข้อความ",
      icon: "▦",
      href: "/memo",
      section: "documents",
      match: (value) => value.startsWith("/memo"),
    },
    {
      label: "คำสั่ง",
      icon: "▧",
      href: "/orders",
      section: "documents",
      match: (value) => value.startsWith("/orders"),
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
        icon: "▤",
        href: "/admin/leave",
        section: "review",
        match: (value) => value.startsWith("/admin/leave"),
      },
      {
        label: "พิจารณาไปราชการ",
        icon: "▥",
        href: "/admin/official-duty",
        section: "review",
        match: (value) => value.startsWith("/admin/official-duty"),
      },
      {
        label: "พิจารณาบันทึกข้อความ",
        icon: "▦",
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
      }
    );
  }

  return items;
}
