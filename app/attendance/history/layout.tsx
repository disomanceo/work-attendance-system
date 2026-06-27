import AppShell from "@/components/layout/AppShell";

export default function AttendanceHistoryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
