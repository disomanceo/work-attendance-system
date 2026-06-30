export type AppNavigationItem = {
  label: string;
  icon: string;
  href: string;
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
      match: (value) => value === "/attendance",
    },
    {
      label: "การลงเวลาปฏิบัติงาน",
      icon: "▣",
      href: reportHref,
      match: (value) =>
        value.startsWith("/admin/attendance") ||
        value.startsWith("/attendance/history"),
    },
    {
      label: "ขออนุญาตลาป่วย-ลากิจ",
      icon: "▤",
      href: "/leave",
      match: (value) => value.startsWith("/leave"),
    },
    {
      label: "ขออนุญาตไปราชการ",
      icon: "✈",
      href: "/official-duty",
      match: (value) => value.startsWith("/official-duty"),
    },
    {
      label: "บันทึกข้อความ",
      icon: "▦",
      href: "/memo",
      match: (value) => value.startsWith("/memo"),
    },
    {
      label: "ข้อมูลส่วนตัว",
      icon: "♙",
      href: "/account/profile",
      match: (value) => value.startsWith("/account"),
    },
  ];

  if (isManagerRole(role)) {
    items.push(
      {
        label: "พิจารณาไปราชการ",
        icon: "▥",
        href: "/admin/official-duty",
        match: (value) => value.startsWith("/admin/official-duty"),
      },
      {
        label: "พิจารณาใบลา",
        icon: "▤",
        href: "/admin/leave",
        match: (value) => value.startsWith("/admin/leave"),
      },
      {
        label: "พิจารณาบันทึกข้อความ",
        icon: "▦",
        href: "/admin/memo",
        match: (value) => value.startsWith("/admin/memo"),
      },
      {
        label: "ตั้งค่า",
        icon: "⚙",
        href: "/admin/settings",
        match: (value) => value.startsWith("/admin/settings"),
      },
      {
        label: "จัดการสมาชิก",
        icon: "👥",
        href: "/admin/members",
        match: (value) => value.startsWith("/admin/members"),
      }
    );
  }

  return items;
}
