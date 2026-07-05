export type BudgetActivity = {
  id: string;
  name: string;
  budget: number;
  spent: number;
  status: string;
  responsible: string;
  period: string;
};

export type BudgetProject = {
  id: string;
  name: string;
  owner: string;
  period: string;
  budget: number;
  spent: number;
  status: string;
  objective: string;
  targetGroup: string;
  budgetSource: string;
  activities: BudgetActivity[];
};

export const mockBudgetProjects: BudgetProject[] = [
  {
    id: "PRJ-2569-001",
    name: "โครงการยกระดับผลสัมฤทธิ์ทางการเรียน",
    owner: "นางสาวอุไรวรรณ ศรีโปฎก",
    period: "พฤษภาคม 2569 – มีนาคม 2570",
    budget: 120000,
    spent: 42000,
    status: "กำลังดำเนินการ",
    objective:
      "พัฒนาผลสัมฤทธิ์ทางการเรียนของนักเรียนผ่านกิจกรรมเสริมทักษะ การติว และการจัดหาสื่อการเรียนรู้",
    targetGroup: "นักเรียนทุกระดับชั้น",
    budgetSource: "เงินอุดหนุนรายหัว",
    activities: [
      {
        id: "ACT-001",
        name: "กิจกรรมติวเสริมก่อนสอบ",
        budget: 35000,
        spent: 18000,
        status: "กำลังดำเนินการ",
        responsible: "กลุ่มสาระการเรียนรู้",
        period: "กรกฎาคม – กันยายน 2569",
      },
      {
        id: "ACT-002",
        name: "กิจกรรมค่ายวิชาการ",
        budget: 50000,
        spent: 24000,
        status: "เตรียมดำเนินการ",
        responsible: "ฝ่ายวิชาการ",
        period: "พฤศจิกายน 2569",
      },
      {
        id: "ACT-003",
        name: "กิจกรรมจัดซื้อสื่อการเรียนรู้",
        budget: 35000,
        spent: 0,
        status: "ยังไม่เริ่ม",
        responsible: "งานพัสดุ",
        period: "มิถุนายน – สิงหาคม 2569",
      },
    ],
  },
  {
    id: "PRJ-2569-002",
    name: "โครงการส่งเสริมสุขภาพและอนามัยนักเรียน",
    owner: "นายสมชาย ใจดี",
    period: "มิถุนายน 2569 – กุมภาพันธ์ 2570",
    budget: 85000,
    spent: 32000,
    status: "กำลังดำเนินการ",
    objective:
      "ส่งเสริมสุขภาพกาย สุขภาพจิต และพฤติกรรมด้านสุขอนามัยของนักเรียนอย่างต่อเนื่อง",
    targetGroup: "นักเรียนและบุคลากรในโรงเรียน",
    budgetSource: "เงินรายได้สถานศึกษา",
    activities: [
      {
        id: "ACT-004",
        name: "กิจกรรมตรวจสุขภาพนักเรียน",
        budget: 30000,
        spent: 30000,
        status: "เสร็จแล้ว",
        responsible: "ครูอนามัยโรงเรียน",
        period: "มิถุนายน 2569",
      },
      {
        id: "ACT-005",
        name: "กิจกรรมรณรงค์อาหารปลอดภัย",
        budget: 25000,
        spent: 2000,
        status: "กำลังดำเนินการ",
        responsible: "งานโภชนาการ",
        period: "ตลอดปีการศึกษา",
      },
      {
        id: "ACT-006",
        name: "กิจกรรมกีฬาเพื่อสุขภาพ",
        budget: 30000,
        spent: 0,
        status: "ยังไม่เริ่ม",
        responsible: "กลุ่มสาระสุขศึกษา",
        period: "ธันวาคม 2569",
      },
    ],
  },
];

export function getMockBudgetProject(id: string) {
  return mockBudgetProjects.find((project) => project.id === id);
}
