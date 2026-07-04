import BudgetModuleShell from "@/components/budget/BudgetModuleShell";

export default function Page() {
  return (
    <BudgetModuleShell
      eyebrow="งานงบประมาณ"
      title="รายงานงบประมาณ"
      description="สรุปภาพรวมการจัดสรร การใช้จ่าย และสถานะโครงการ"
    >
      <section
        style={{
          padding: "36px 24px",
          border: "1px dashed #c4b5fd",
          borderRadius: "18px",
          background: "#ffffff",
          textAlign: "center",
        }}
      >
        <strong
          style={{
            display: "block",
            color: "#6d28d9",
            fontSize: "22px",
          }}
        >
          กำลังปรับปรุง
        </strong>
        <p style={{ margin: "10px 0 0", color: "#6b7280" }}>
          ส่วนนี้ยังอยู่ระหว่างการออกแบบและเชื่อมต่อข้อมูล
        </p>
      </section>
    </BudgetModuleShell>
  );
}
