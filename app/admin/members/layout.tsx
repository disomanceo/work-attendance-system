import AppShell from "@/components/layout/AppShell";

export default function AdminMembersLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
