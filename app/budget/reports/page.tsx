import BudgetModuleShell from "@/components/budget/BudgetModuleShell";

export default function Page() {
  return (
    <BudgetModuleShell
      eyebrow="งานงบประมาณ"
      title="รายงานงบประมาณ"
      description="สรุปงบประมาณที่ได้รับ ใช้ไป คงเหลือ และความก้าวหน้าของโครงการ"
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
