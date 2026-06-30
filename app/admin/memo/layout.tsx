import AppShell from "@/components/layout/AppShell";

export default function AdminMemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
