import AppShell from "@/components/layout/AppShell";

export default function AccountProfileLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
