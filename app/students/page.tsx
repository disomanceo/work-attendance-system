"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StudentRow = {
  id: string;
  student_code: string;
  full_name: string;
  class_level: string;
  class_room: string;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type StudentsResponse = {
  ok?: boolean;
  students?: StudentRow[];
  student?: StudentRow;
  message?: string;
  error?: string;
};

type EditingStudent = {
  id: string;
  student_code: string;
  full_name: string;
  class_level: string;
  class_room: string;
  status: string;
};

const CLASS_LEVELS = ["อนุบาล 2", "อนุบาล 3", "ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"];
const CLASS_ROOMS = ["-", "1", "2", "3"];

const blankStudent: EditingStudent = {
  id: "",
  student_code: "",
  full_name: "",
  class_level: "อนุบาล 2",
  class_room: "-",
  status: "active",
};

function statusLabel(value: string) {
  if (value === "active") return "กำลังเรียน";
  if (value === "transferred") return "ย้ายออก";
  if (value === "inactive") return "พักการเรียน";
  if (value === "graduated") return "จบการศึกษา";
  if (value === "deleted") return "ลบแล้ว";
  return value || "-";
}

function classNameOf(student: Pick<StudentRow, "class_level" | "class_room">) {
  return `${student.class_level}/${student.class_room || "-"}`;
}

function studentNo(student: StudentRow, index: number) {
  const digits = student.student_code.match(/\d+$/)?.[0];
  if (digits) return String(Number(digits));
  return String(index + 1);
}

export default function StudentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("ทั้งหมด");
  const [editing, setEditing] = useState<EditingStudent | null>(null);
  const [mode, setMode] = useState<"add" | "edit" | "move" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const fetchJson = useCallback(async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
    const { data: { session } } = await supabase.auth.getSession();

    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

    const response = await fetch(url, { ...options, headers, cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : { message: await response.text() };

    if (!response.ok) throw new Error(data?.message || data?.error || "ทำรายการไม่สำเร็จ");
    return data as T;
  }, [supabase]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (classFilter !== "ทั้งหมด") {
        const [classLevel, classRoom] = classFilter.split("/");
        params.set("classLevel", classLevel);
        if (classRoom && classRoom !== "-") params.set("classRoom", classRoom);
      }

      const data = await fetchJson<StudentsResponse>(`/api/students?${params.toString()}`);
      setStudents(data.students ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "โหลดข้อมูลนักเรียนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [classFilter, fetchJson, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadStudents(); }, 180);
    return () => window.clearTimeout(timer);
  }, [loadStudents]);

  const classOptions = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(students.map(classNameOf)))], [students]);

  function startAdd() {
    setEditing({ ...blankStudent });
    setMode("add");
    setMessage("");
  }

  function startEdit(student: StudentRow) {
    setEditing({
      id: student.id,
      student_code: student.student_code || "",
      full_name: student.full_name || "",
      class_level: student.class_level || "อนุบาล 2",
      class_room: student.class_room || "-",
      status: student.status || "active",
    });
    setMode("edit");
    setMessage("");
  }

  function startMove(student: StudentRow) {
    setEditing({
      id: student.id,
      student_code: student.student_code || "",
      full_name: student.full_name || "",
      class_level: student.class_level || "อนุบาล 2",
      class_room: student.class_room || "-",
      status: student.status || "active",
    });
    setMode("move");
    setMessage("");
  }

  function closeForm() {
    setEditing(null);
    setMode(null);
  }

  function updateEditing(key: keyof EditingStudent, value: string) {
    setEditing((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveStudent() {
    if (!editing) return;

    setSaving(true);
    setMessage("");

    const payload = {
      student_code: editing.student_code.trim(),
      full_name: editing.full_name.trim(),
      class_level: editing.class_level,
      class_room: editing.class_room || "-",
      status: editing.status || "active",
    };

    try {
      const url = mode === "add" ? "/api/students" : `/api/students/${editing.id}`;
      const method = mode === "add" ? "POST" : "PUT";
      const data = await fetchJson<StudentsResponse>(url, { method, body: JSON.stringify(payload) });
      setMessage(data.message || "บันทึกข้อมูลแล้ว");
      closeForm();
      await loadStudents();
      window.setTimeout(() => setMessage(""), 2200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function deleteStudent(studentId: string) {
    if (!confirm("ลบนักเรียนคนนี้หรือไม่")) return;

    setSaving(true);
    setMessage("");

    try {
      const data = await fetchJson<StudentsResponse>(`/api/students/${studentId}`, { method: "DELETE" });
      setMessage(data.message || "ลบนักเรียนแล้ว");
      await loadStudents();
      window.setTimeout(() => setMessage(""), 2200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบนักเรียนไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fbf7ef] px-2 py-2 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-none flex-col gap-2 xl:max-w-7xl">
        <header className="rounded-[24px] border border-orange-100 bg-white/85 px-3 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-[19px] font-semibold leading-tight text-orange-800">ข้อมูลนักเรียน</h1>
              <p className="mt-1 text-[12px] text-slate-600">ข้อมูลบันทึกลง Supabase จริง ไม่หายเมื่อรีเฟรช</p>
            </div>
            <button type="button" onClick={startAdd} className="h-9 rounded-2xl bg-orange-500 px-3 text-[13px] font-medium text-white">
              + เพิ่ม
            </button>
          </div>
        </header>

        {message ? (
          <div className="rounded-2xl bg-blue-50 px-3 py-2 text-[12px] font-medium text-blue-700 ring-1 ring-blue-100">
            {message}
          </div>
        ) : null}

        <section className="rounded-[22px] border border-orange-100 bg-white/85 p-2 shadow-sm">
          <div className="grid grid-cols-[1fr_96px] gap-1.5 lg:grid-cols-[1fr_160px]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 min-w-0 rounded-xl border border-orange-100 bg-white px-2 text-[13px] outline-none focus:border-orange-300" placeholder="ค้นหาชื่อ รหัสนักเรียน..." />
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="h-9 rounded-xl border border-orange-100 bg-white px-1.5 text-[12px] outline-none focus:border-orange-300">
              {classOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </section>

        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[34px_1fr_58px_88px] bg-slate-50 px-2 py-2 text-[12px] font-semibold text-slate-600 lg:grid-cols-[54px_1fr_120px_140px]">
            <span>ที่</span>
            <span>นักเรียน</span>
            <span className="text-center">ห้อง</span>
            <span className="text-right">จัดการ</span>
          </div>
          {loading ? (
            <div className="p-4 text-sm text-slate-600">กำลังโหลดข้อมูล...</div>
          ) : students.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">ยังไม่มีข้อมูลนักเรียน</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {students.map((student, index) => (
                <div key={student.id} className="grid grid-cols-[34px_1fr_58px_88px] items-center gap-1 px-2 py-1.5 lg:grid-cols-[54px_1fr_120px_140px]">
                  <span className="text-center text-[12px] text-slate-500">{studentNo(student, index)}</span>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-100 text-[13px] lg:h-9 lg:w-9">◉</span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-normal leading-tight text-slate-900 lg:text-[15px]">{student.full_name}</p>
                      <p className="truncate text-[10.5px] leading-tight text-slate-500">{student.student_code} · {statusLabel(student.status)}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-blue-50 px-1 py-1 text-center text-[10.5px] text-blue-700">{classNameOf(student)}</span>
                  <div className="flex justify-end gap-1">
                    <button type="button" onClick={() => startEdit(student)} className="rounded-lg bg-slate-100 px-1.5 py-1 text-[11px] text-slate-700" title="แก้ไข">✎</button>
                    <button type="button" onClick={() => startMove(student)} className="rounded-lg bg-amber-50 px-1.5 py-1 text-[11px] text-amber-700" title="ย้าย">⇄</button>
                    <button type="button" onClick={() => void deleteStudent(student.id)} className="rounded-lg bg-rose-50 px-1.5 py-1 text-[11px] text-rose-700" title="ลบ">×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {editing && mode ? (
          <section className="rounded-[24px] border border-orange-100 bg-white/95 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[16px] font-semibold text-orange-800">
                {mode === "add" ? "เพิ่มนักเรียน" : mode === "move" ? "ย้ายนักเรียน" : "แก้ไขนักเรียน"}
              </h2>
              <button type="button" onClick={closeForm} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">ปิด</button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
              <label className="text-[11px] text-slate-600">รหัสนักเรียน
                <input value={editing.student_code} onChange={(event) => updateEditing("student_code", event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-2 text-[13px]" />
              </label>
              <label className="col-span-1 text-[11px] text-slate-600 lg:col-span-2">ชื่อ-สกุล
                <input value={editing.full_name} onChange={(event) => updateEditing("full_name", event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-2 text-[13px]" />
              </label>
              <label className="text-[11px] text-slate-600">สถานะ
                <select value={editing.status} onChange={(event) => updateEditing("status", event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-2 text-[13px]">
                  <option value="active">กำลังเรียน</option>
                  <option value="transferred">ย้ายออก</option>
                  <option value="inactive">พักการเรียน</option>
                  <option value="graduated">จบการศึกษา</option>
                </select>
              </label>
              <label className="text-[11px] text-slate-600">ชั้น
                <select value={editing.class_level} onChange={(event) => updateEditing("class_level", event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-2 text-[13px]">
                  {CLASS_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-slate-600">ห้อง
                <select value={editing.class_room} onChange={(event) => updateEditing("class_room", event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-2 text-[13px]">
                  {CLASS_ROOMS.map((room) => <option key={room} value={room}>{room}</option>)}
                </select>
              </label>
            </div>

            <button type="button" onClick={() => void saveStudent()} disabled={saving} className="mt-3 h-10 w-full rounded-2xl bg-orange-500 text-[14px] font-medium text-white disabled:opacity-50">
              บันทึกข้อมูล
            </button>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              ตาราง students ตอนนี้มีเฉพาะรหัสนักเรียน ชื่อ-สกุล ชั้น ห้อง และสถานะ จึงบันทึกเฉพาะข้อมูลชุดนี้ก่อน
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
