export type AppNavigationItem = {
  label: string;
  icon: string;
  href: string;
  section: "main" | "review" | "account";
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
      section: "main",
      match: (value) => value === "/attendance",
    },
    {
      label: "การลงเวลาปฏิบัติงาน",
      icon: "▣",
      href: reportHref,
      section: "main",
      match: (value) =>
        value.startsWith("/admin/attendance") ||
        value.startsWith("/attendance/history"),
    },
    {
      label: "ขออนุญาตลาป่วย-ลากิจ",
      icon: "▤",
      href: "/leave",
      section: "main",
      match: (value) => value.startsWith("/leave"),
    },
    {
      label: "ขออนุญาตไปราชการ",
      icon: "✈",
      href: "/official-duty",
      section: "main",
      match: (value) => value.startsWith("/official-duty"),
    },
    {
      label: "บันทึกข้อความ",
      icon: "▦",
      href: "/memo",
      section: "main",
      match: (value) => value.startsWith("/memo"),
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
