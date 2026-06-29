import AppShell from "@/components/layout/AppShell";

export default function AdminOfficialDutyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
