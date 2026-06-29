import AppShell from "@/components/layout/AppShell";

export default function AdminLeaveLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
