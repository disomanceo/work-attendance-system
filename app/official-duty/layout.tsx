import AppShell from "@/components/layout/AppShell";

export default function OfficialDutyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
