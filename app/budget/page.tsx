import BudgetModuleShell from "@/components/budget/BudgetModuleShell";
import BudgetSummaryCards from "@/components/budget/BudgetSummaryCards";

export default function BudgetPage() {
  return (
    <BudgetModuleShell
      eyebrow="งานงบประมาณ"
      title="ภาพรวมงบประมาณ"
      description="พื้นที่ภาพรวมสำหรับติดตามงบประมาณ แผนงาน โครงการ การเบิกจ่าย และรายงาน โดยขั้นตอนนี้ยังไม่เชื่อมต่อฐานข้อมูลเดิม"
    >
      <BudgetSummaryCards />
    </BudgetModuleShell>
  );
}
