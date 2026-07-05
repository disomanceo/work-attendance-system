import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <section
        style={{
          maxWidth: "520px",
          padding: "28px",
          border: "1px solid #dcfce7",
          borderRadius: "18px",
          background: "#ffffff",
          textAlign: "center",
        }}
      >
        <h2 style={{ margin: 0, color: "#14532d" }}>ไม่พบโครงการ</h2>
        <p style={{ color: "#6b7280" }}>
          ไม่พบรหัสโครงการที่ต้องการในข้อมูลทดลอง
        </p>
        <Link
          href="/budget/projects"
          style={{
            display: "inline-flex",
            padding: "9px 14px",
            borderRadius: "10px",
            color: "#ffffff",
            background: "#16a34a",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          กลับรายการโครงการ
        </Link>
      </section>
    </main>
  );
}
