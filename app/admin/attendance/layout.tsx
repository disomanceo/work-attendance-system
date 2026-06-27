import AppShell from "@/components/layout/AppShell";

export default function AdminAttendanceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
