import AppShell from "@/components/layout/AppShell";

export default function TeachingSupervisionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
