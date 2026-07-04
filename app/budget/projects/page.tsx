import BudgetModuleShell from "@/components/budget/BudgetModuleShell";

export default function Page() {
  return (
    <BudgetModuleShell
      eyebrow="งานงบประมาณ"
      title="โครงการ / กิจกรรม"
      description="จัดการโครงการ กิจกรรม ผู้รับผิดชอบ ระยะเวลา และวงเงิน"
    >
      <section
        style={{
          padding: "28px",
          borderRadius: "18px",
          border: "1px dashed #c4b5fd",
          background: "#ffffff",
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        หน้านี้พร้อมสำหรับพัฒนาต่อ โดยยังไม่มีการอ่านหรือเขียนข้อมูลจริง
      </section>
    </BudgetModuleShell>
  );
}
