export default function DocumentsPage() {
  return (
    <main
      style={{
        minHeight: "100%",
        padding: "24px",
        background:
          "linear-gradient(180deg, rgba(239,246,255,0.82) 0%, rgba(255,255,255,0) 320px)",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "1120px",
          margin: "0 auto",
          padding: "28px 24px",
          border: "1px solid #dbeafe",
          borderRadius: "22px",
          background: "#ffffff",
          boxShadow: "0 12px 32px rgba(30, 64, 175, 0.06)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#2563eb",
            fontSize: "13px",
            fontWeight: 800,
          }}
        >
          งานหนังสือราชการ
        </p>

        <h1
          style={{
            margin: "8px 0 0",
            color: "#1e3a8a",
            fontSize: "clamp(26px, 3vw, 36px)",
          }}
        >
          รายการหนังสือราชการ
        </h1>

        <div
          aria-label="รายการหนังสือราชการ"
          style={{
            minHeight: "220px",
            marginTop: "24px",
            borderTop: "1px solid #e5e7eb",
          }}
        />
      </section>
    </main>
  );
}
