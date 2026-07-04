type SummaryCardProps = {
  label: string;
  value: string;
  note: string;
};

export default function BudgetSummaryCards() {
  const cards: SummaryCardProps[] = [
    {
      label: "งบประมาณที่ได้รับ",
      value: "0.00 บาท",
      note: "รอเชื่อมต่อข้อมูลจริง",
    },
    {
      label: "งบประมาณที่อนุมัติ",
      value: "0.00 บาท",
      note: "รอเชื่อมต่อข้อมูลจริง",
    },
    {
      label: "เบิกจ่ายแล้ว",
      value: "0.00 บาท",
      note: "รอเชื่อมต่อข้อมูลจริง",
    },
    {
      label: "งบประมาณคงเหลือ",
      value: "0.00 บาท",
      note: "รอเชื่อมต่อข้อมูลจริง",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "14px",
      }}
    >
      {cards.map((card) => (
        <article
          key={card.label}
          style={{
            minHeight: "132px",
            padding: "20px",
            borderRadius: "18px",
            border: "1px solid #ede9fe",
            background: "#ffffff",
            boxShadow: "0 8px 24px rgba(76, 29, 149, 0.05)",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#6b7280",
              fontSize: "14px",
              fontWeight: 700,
            }}
          >
            {card.label}
          </p>
          <strong
            style={{
              display: "block",
              marginTop: "10px",
              color: "#4c1d95",
              fontSize: "24px",
            }}
          >
            {card.value}
          </strong>
          <small
            style={{
              display: "block",
              marginTop: "10px",
              color: "#9ca3af",
            }}
          >
            {card.note}
          </small>
        </article>
      ))}
    </div>
  );
}
