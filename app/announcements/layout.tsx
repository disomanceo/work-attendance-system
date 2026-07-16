import AppShell from "@/components/layout/AppShell";

export default function AnnouncementsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
