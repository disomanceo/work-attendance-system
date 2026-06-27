import AppShell from "@/components/layout/AppShell";

export default function LeaveLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
