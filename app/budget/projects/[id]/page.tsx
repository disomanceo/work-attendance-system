import BudgetModuleShell from "@/components/budget/BudgetModuleShell";
import BudgetProjectDetailReadOnlyClient from "@/components/budget/projects/BudgetProjectDetailReadOnlyClient";

export default async function BudgetProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <BudgetModuleShell
      eyebrow="งานงบประมาณ"
      title="รายละเอียดโครงการ"
      description="อ่านรายละเอียดโครงการ กิจกรรม และเอกสารแนบจากระบบงบประมาณเดิม โดยไม่แก้ไขข้อมูลต้นทาง"
    >
      <BudgetProjectDetailReadOnlyClient projectId={id} />
    </BudgetModuleShell>
  );
}
