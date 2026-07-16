import AppShell from "@/components/layout/AppShell";

export default function SchoolLibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
