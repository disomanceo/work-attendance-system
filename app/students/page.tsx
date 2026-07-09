import Link from "next/link";

const demoStudents = [
  { code: "D010001", name: "เด็กชายกานต์ ใจดี", room: "อ.2/1", status: "กำลังเรียน" },
  { code: "D010002", name: "เด็กหญิงมาลี มีวินัย", room: "อ.2/1", status: "กำลังเรียน" },
  { code: "D020001", name: "เด็กชายปรีชา ตั้งใจ", room: "อ.3/1", status: "กำลังเรียน" },
];

export default function StudentsPage() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">งานนักเรียน</p>
          <h1 className="text-2xl font-bold text-slate-900">ข้อมูลนักเรียน</h1>
          <p className="text-sm text-slate-600">จัดการข้อมูลนักเรียนพื้นฐาน แยกตามระดับชั้นและห้องเรียน</p>
        </div>
        <Link href="/students/attendance" className="rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
          ไปหน้าเช็คชื่อนักเรียน
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_140px]">
          <input className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="ค้นหาชื่อ รหัส หรือห้องเรียน..." />
          <select className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500" defaultValue="all">
            <option value="all">ทุกชั้นเรียน</option>
            <option>อ.2/1</option>
            <option>อ.3/1</option>
            <option>ป.1/1</option>
            <option>ป.2/1</option>
            <option>ป.3/1</option>
            <option>ป.4/1</option>
            <option>ป.5/1</option>
            <option>ป.6/1</option>
          </select>
          <button className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">เพิ่มนักเรียน</button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">รหัส</th>
                <th className="px-4 py-3 font-semibold">ชื่อ-นามสกุล</th>
                <th className="px-4 py-3 font-semibold">ห้องเรียน</th>
                <th className="px-4 py-3 font-semibold">สถานะ</th>
                <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {demoStudents.map((student) => (
                <tr key={student.code} className="hover:bg-blue-50/40">
                  <td className="px-4 py-3 font-semibold text-slate-700">{student.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{student.name}</td>
                  <td className="px-4 py-3"><span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">{student.room}</span></td>
                  <td className="px-4 py-3 text-emerald-700">{student.status}</td>
                  <td className="px-4 py-3 text-right"><button className="text-blue-600 hover:text-blue-800">แก้ไข</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}