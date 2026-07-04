import Link from "next/link";

type BudgetModuleShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
};

const links = [
  { href: "/budget", label: "ภาพรวม" },
  { href: "/budget/plans", label: "แผนงบประมาณ" },
  { href: "/budget/projects", label: "โครงการ / กิจกรรม" },
  { href: "/budget/disbursements", label: "การเบิกจ่าย" },
  { href: "/budget/reports", label: "รายงาน" },
];

export default function BudgetModuleShell({
  eyebrow,
  title,
  description,
  children,
}: BudgetModuleShellProps) {
  return (
    <main
      style={{
        minHeight: "100%",
        padding: "24px",
        background:
          "linear-gradient(180deg, rgba(245,243,255,0.75) 0%, rgba(255,255,255,0) 320px)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "1320px", margin: "0 auto" }}>
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #ede9fe",
            borderRadius: "22px",
            padding: "24px",
            boxShadow: "0 12px 32px rgba(76, 29, 149, 0.06)",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#7c3aed",
              fontSize: "13px",
              fontWeight: 800,
              letterSpacing: "0.04em",
            }}
          >
            {eyebrow}
          </p>

          <h1
            style={{
              margin: "8px 0 0",
              color: "#2e1065",
              fontSize: "clamp(24px, 3vw, 34px)",
              lineHeight: 1.25,
            }}
          >
            {title}
          </h1>

          <p
            style={{
              margin: "12px 0 0",
              maxWidth: "780px",
              color: "#6b7280",
              lineHeight: 1.75,
            }}
          >
            {description}
          </p>

          <nav
            aria-label="เมนูย่อยงานงบประมาณ"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginTop: "20px",
            }}
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: "38px",
                  padding: "8px 14px",
                  borderRadius: "999px",
                  border: "1px solid #ddd6fe",
                  background: "#faf5ff",
                  color: "#6d28d9",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </section>

        <section style={{ marginTop: "18px" }}>{children}</section>
      </div>
    </main>
  );
}
