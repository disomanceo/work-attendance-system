import AppShell from "@/components/layout/AppShell";

export default function ChangePinLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
