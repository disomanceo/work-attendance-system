"use client";

import { useMemo, useState } from "react";

type AttendanceStatus = "present" | "absent" | "leave" | "late";

type Student = {
  code: string;
  name: string;
};

const students: Student[] = [
  { code: "D010001", name: "เด็กชายกานต์ ใจดี" },
  { code: "D010002", name: "เด็กหญิงมาลี มีวินัย" },
  { code: "D010003", name: "เด็กชายปรีชา ตั้งใจ" },
  { code: "D010004", name: "เด็กหญิงสุธิดา ร่าเริง" },
  { code: "D010005", name: "เด็กชายอนุชา มีวินัย" },
];

const statusLabels: Record<AttendanceStatus, string> = {
  present: "มา",
  absent: "ขาด",
  leave: "ลา",
  late: "สาย",
};

const statusClasses: Record<AttendanceStatus, string> = {
  present: "bg-emerald-600 text-white border-emerald-600",
  absent: "bg-rose-600 text-white border-rose-600",
  leave: "bg-violet-600 text-white border-violet-600",
  late: "bg-amber-500 text-white border-amber-500",
};

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export default function StudentAttendancePage() {
  const [date, setDate] = useState(todayInputValue());
  const [room, setRoom] = useState("อ.2/1");
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(students.map((student) => [student.code, "present"])) as Record<string, AttendanceStatus>,
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const summary = useMemo(() => {
    return students.reduce(
      (acc, student) => {
        acc[records[student.code] ?? "present"] += 1;
        return acc;
      },
      { present: 0, absent: 0, leave: 0, late: 0 } as Record<AttendanceStatus, number>,
    );
  }, [records]);

  function setAllPresent() {
    setRecords(Object.fromEntries(students.map((student) => [student.code, "present"])) as Record<string, AttendanceStatus>);
  }

  function saveAll() {
    setSavedAt(new Date().toLocaleString("th-TH"));
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">งานนักเรียน</p>
          <h1 className="text-2xl font-bold text-slate-900">เช็คชื่อนักเรียน</h1>
          <p className="text-sm text-slate-600">ค่าเริ่มต้นเป็นมา เปลี่ยนเฉพาะนักเรียนที่ขาด ลา หรือสาย</p>
        </div>
        <button onClick={saveAll} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
          บันทึกทั้งหมด
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[180px_220px_1fr_auto] md:items-end">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>วันที่</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>ชั้น/ห้อง</span>
            <select value={room} onChange={(event) => setRoom(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500">
              <option>อ.2/1</option>
              <option>อ.3/1</option>
              <option>ป.1/1</option>
              <option>ป.2/1</option>
              <option>ป.3/1</option>
              <option>ป.4/1</option>
              <option>ป.5/1</option>
              <option>ป.6/1</option>
            </select>
          </label>
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><div className="font-bold">{summary.present}</div><div>มา</div></div>
            <div className="rounded-xl bg-rose-50 p-3 text-rose-700"><div className="font-bold">{summary.absent}</div><div>ขาด</div></div>
            <div className="rounded-xl bg-violet-50 p-3 text-violet-700"><div className="font-bold">{summary.leave}</div><div>ลา</div></div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-700"><div className="font-bold">{summary.late}</div><div>สาย</div></div>
          </div>
          <button onClick={setAllPresent} className="rounded-xl border border-emerald-300 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">มาทุกคน</button>
        </div>
        {savedAt ? <p className="mt-3 text-sm font-medium text-emerald-700">บันทึกล่าสุด: {savedAt}</p> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">รหัส</th>
                <th className="px-4 py-3 font-semibold">ชื่อ-นามสกุล</th>
                <th className="px-4 py-3 text-center font-semibold">สถานะการเข้าเรียน</th>
                <th className="px-4 py-3 font-semibold">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((student) => {
                const active = records[student.code] ?? "present";
                return (
                  <tr key={student.code} className="hover:bg-blue-50/40">
                    <td className="px-4 py-3 font-semibold text-slate-700">{student.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{student.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-center gap-2">
                        {(Object.keys(statusLabels) as AttendanceStatus[]).map((status) => (
                          <button
                            key={status}
                            onClick={() => setRecords((current) => ({ ...current, [student.code]: status }))}
                            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${active === status ? statusClasses[status] : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                          >
                            {statusLabels[status]}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={notes[student.code] ?? ""}
                        onChange={(event) => setNotes((current) => ({ ...current, [student.code]: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                        placeholder="หมายเหตุ..."
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}