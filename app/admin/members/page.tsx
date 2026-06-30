"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MemberRole = "admin" | "director" | "teacher" | "staff" | "janitor";
type AccountStatus = "pending" | "active" | "suspended";
type MemberFilter = "pending" | "active" | "suspended" | "all";

type Member = {
  id: string;
  full_name: string;
  phone: string;
  position: string | null;
  role: MemberRole;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
};

type MembersResponse = {
  ok: boolean;
  members?: Member[];
  member?: Member;
  message?: string;
};

const roleOptions: Array<{ value: MemberRole; label: string }> = [
  { value: "admin", label: "ผู้ดูแลระบบ" },
  { value: "director", label: "ผู้บริหาร" },
  { value: "teacher", label: "ครู" },
  { value: "staff", label: "เจ้าหน้าที่" },
  { value: "janitor", label: "ภารโรง" },
];

const statusOptions: Array<{ value: AccountStatus; label: string }> = [
  { value: "pending", label: "รออนุมัติ" },
  { value: "active", label: "ใช้งานได้" },
  { value: "suspended", label: "ระงับการใช้งาน" },
];

const filterOptions: Array<{ value: MemberFilter; label: string }> = [
  { value: "pending", label: "รออนุมัติ" },
  { value: "active", label: "อนุมัติแล้ว" },
  { value: "suspended", label: "ระงับการใช้งาน" },
  { value: "all", label: "ทั้งหมด" },
];

function formatThaiPhone(phone: string) {
  return phone.startsWith("66") && phone.length === 11
    ? `0${phone.slice(2)}`
    : phone;
}

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusLabel(status: AccountStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function getRoleLabel(role: MemberRole) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

export default function AdminMembersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [activeFilter, setActiveFilter] = useState<MemberFilter>("pending");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        router.replace("/login");
        return;
      }

      setCurrentUserId(session.user.id);
      const response = await fetch("/api/admin/members", {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as MembersResponse;

      if (!response.ok || !result.ok) {
        if (response.status === 401) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }
        if (response.status === 403) {
          router.replace("/attendance");
          return;
        }
        throw new Error(result.message || "ไม่สามารถโหลดข้อมูลสมาชิกได้");
      }

      setMembers(result.members ?? []);
    } catch (error) {
      console.error("Load members page error:", error);
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาดระหว่างโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const counts = useMemo(() => ({
    pending: members.filter((member) => member.account_status === "pending").length,
    active: members.filter((member) => member.account_status === "active").length,
    suspended: members.filter((member) => member.account_status === "suspended").length,
    all: members.length,
  }), [members]);

  const filteredMembers = useMemo(() => {
    if (activeFilter === "all") return members;
    return members.filter((member) => member.account_status === activeFilter);
  }, [activeFilter, members]);

  function updateLocalMember<K extends keyof Member>(id: string, key: K, value: Member[K]) {
    setMembers((current) => current.map((member) =>
      member.id === id ? { ...member, [key]: value } : member
    ));
  }

  async function saveMember(
    member: Member,
    overrides?: Partial<Pick<Member, "role" | "account_status" | "position">>,
    successMessage?: string,
  ) {
    const nextMember = { ...member, ...overrides };
    setSavingId(member.id);
    setMessage("");

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        router.replace("/login");
        return;
      }

      const response = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: nextMember.id,
          role: nextMember.role,
          accountStatus: nextMember.account_status,
          position: nextMember.position ?? "",
        }),
      });
      const result = (await response.json()) as MembersResponse;

      if (!response.ok || !result.ok || !result.member) {
        throw new Error(result.message || "ไม่สามารถบันทึกข้อมูลสมาชิกได้");
      }

      setMembers((current) => current.map((item) =>
        item.id === result.member?.id ? result.member : item
      ));
      setMessageType("success");
      setMessage(successMessage || result.message || "บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว");
    } catch (error) {
      console.error("Save member error:", error);
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาดระหว่างบันทึกข้อมูล");
    } finally {
      setSavingId("");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="dashboard-loading">
        <span className="spinner dark" />
        กำลังโหลดรายชื่อสมาชิก...
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p>ADMINISTRATION</p>
          <h1>จัดการสมาชิก</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => router.push("/attendance")}>กลับหน้าหลัก</button>
          <button type="button" onClick={handleLogout}>ออกจากระบบ</button>
        </div>
      </header>

      {counts.pending > 0 && (
        <section style={{ marginTop: 28, padding: 20, borderRadius: 20, border: "1px solid #f4c98b", background: "#fff8ec", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <strong style={{ display: "block", color: "#8a4b08", fontSize: 20 }}>มีสมาชิกใหม่รออนุมัติ {counts.pending} คน</strong>
            <span style={{ color: "#9a6700" }}>ตรวจสอบตำแหน่งและบทบาทก่อนกดอนุมัติ</span>
          </div>
          <button type="button" onClick={() => setActiveFilter("pending")} style={{ border: 0, borderRadius: 12, padding: "11px 17px", background: "#a85d0b", color: "white", fontWeight: 800, cursor: "pointer" }}>ตรวจสอบสมาชิกใหม่</button>
        </section>
      )}

      <section style={{ marginTop: 24, padding: 24, border: "1px solid #d8e2ed", borderRadius: 24, background: "#ffffff", boxShadow: "0 18px 45px rgba(28, 60, 93, 0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, color: "#071d32", fontSize: 24 }}>รายชื่อสมาชิก</h2>
            <p style={{ margin: "6px 0 0", color: "#667085" }}>แสดง {filteredMembers.length} จากทั้งหมด {members.length} คน</p>
          </div>
          <button type="button" onClick={() => void loadMembers()} style={{ padding: "11px 17px", border: "1px solid #cfdbe7", borderRadius: 13, background: "#ffffff", color: "#102a43", fontWeight: 700, cursor: "pointer" }}>โหลดข้อมูลใหม่</button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          {filterOptions.map((option) => {
            const selected = activeFilter === option.value;
            return (
              <button key={option.value} type="button" onClick={() => setActiveFilter(option.value)} style={{ border: selected ? "1px solid #6d28d9" : "1px solid #d8e2ed", borderRadius: 999, padding: "10px 14px", background: selected ? "#f1eaff" : "#ffffff", color: selected ? "#5b21b6" : "#475467", fontWeight: 800, cursor: "pointer" }}>
                {option.label} <span style={{ marginLeft: 5, minWidth: 24, display: "inline-block", padding: "2px 7px", borderRadius: 999, background: selected ? "#6d28d9" : "#eef2f6", color: selected ? "#ffffff" : "#475467", fontSize: 12 }}>{counts[option.value]}</span>
              </button>
            );
          })}
        </div>

        {message && (
          <div role="alert" style={{ marginBottom: 20, padding: "13px 15px", borderRadius: 14, border: messageType === "success" ? "1px solid #a7e3ba" : "1px solid #f2b8b8", color: messageType === "success" ? "#146c2e" : "#c81e1e", background: messageType === "success" ? "#f1fff5" : "#fff5f5", fontWeight: 700 }}>{message}</div>
        )}

        {filteredMembers.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#667085", border: "1px dashed #d8e2ed", borderRadius: 18 }}>
            {activeFilter === "pending" ? "ไม่มีสมาชิกที่รออนุมัติ" : "ไม่มีสมาชิกในสถานะนี้"}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {filteredMembers.map((member) => {
              const isCurrentUser = member.id === currentUserId;
              const isPending = member.account_status === "pending";
              const isSaving = savingId === member.id;

              return (
                <article key={member.id} style={{ padding: 20, border: isPending ? "1px solid #e9c46a" : "1px solid #d8e2ed", borderRadius: 20, background: isPending ? "#fffdf7" : "#fbfdff" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, alignItems: "end" }}>
                    <div style={{ minWidth: 220 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <h3 style={{ margin: 0, color: "#071d32", fontSize: 18 }}>{member.full_name}</h3>
                        {isCurrentUser && <span style={{ padding: "4px 8px", borderRadius: 999, color: "#0b5ed7", background: "#e8f3ff", fontSize: 12, fontWeight: 800 }}>บัญชีของคุณ</span>}
                        {isPending && <span style={{ padding: "4px 8px", borderRadius: 999, color: "#9a6700", background: "#fff0c2", fontSize: 12, fontWeight: 800 }}>สมาชิกใหม่</span>}
                      </div>
                      <p style={{ margin: "8px 0 0", color: "#667085" }}>{formatThaiPhone(member.phone)}</p>
                      <p style={{ margin: "5px 0 0", color: "#98a2b3", fontSize: 13 }}>สมัครเมื่อ {formatThaiDate(member.created_at)}</p>
                      <p style={{ margin: "5px 0 0", color: "#98a2b3", fontSize: 13 }}>{getRoleLabel(member.role)} · {getStatusLabel(member.account_status)}</p>
                    </div>

                    <label>
                      <span style={{ display: "block", marginBottom: 7, color: "#344054", fontSize: 13, fontWeight: 700 }}>ตำแหน่ง</span>
                      <input type="text" value={member.position ?? ""} maxLength={150} onChange={(event) => updateLocalMember(member.id, "position", event.target.value)} style={{ width: "100%", height: 44, padding: "0 12px", border: "1px solid #d8e2ed", borderRadius: 12, outline: "none", background: "#ffffff" }} />
                    </label>

                    <label>
                      <span style={{ display: "block", marginBottom: 7, color: "#344054", fontSize: 13, fontWeight: 700 }}>บทบาท</span>
                      <select value={member.role} disabled={isCurrentUser} onChange={(event) => updateLocalMember(member.id, "role", event.target.value as MemberRole)} style={{ width: "100%", height: 44, padding: "0 12px", border: "1px solid #d8e2ed", borderRadius: 12, background: isCurrentUser ? "#eef2f6" : "#ffffff" }}>
                        {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>

                    {!isPending && (
                      <label>
                        <span style={{ display: "block", marginBottom: 7, color: "#344054", fontSize: 13, fontWeight: 700 }}>สถานะ</span>
                        <select value={member.account_status} disabled={isCurrentUser} onChange={(event) => updateLocalMember(member.id, "account_status", event.target.value as AccountStatus)} style={{ width: "100%", height: 44, padding: "0 12px", border: "1px solid #d8e2ed", borderRadius: 12, background: isCurrentUser ? "#eef2f6" : "#ffffff" }}>
                          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                    )}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {isPending ? (
                        <>
                          <button type="button" disabled={isSaving} onClick={() => void saveMember(member, { account_status: "active" }, `อนุมัติ ${member.full_name} เรียบร้อยแล้ว`)} style={{ minWidth: 100, height: 44, padding: "0 16px", border: 0, borderRadius: 12, color: "#ffffff", background: "linear-gradient(135deg, #15803d, #22c55e)", fontWeight: 800, cursor: isSaving ? "wait" : "pointer", opacity: isSaving ? 0.7 : 1 }}>{isSaving ? "กำลังบันทึก..." : "อนุมัติ"}</button>
                          <button type="button" disabled={isSaving} onClick={() => void saveMember(member, { account_status: "suspended" }, `ไม่อนุมัติ ${member.full_name}`)} style={{ minWidth: 100, height: 44, padding: "0 16px", border: "1px solid #ef4444", borderRadius: 12, color: "#b91c1c", background: "#fff5f5", fontWeight: 800, cursor: isSaving ? "wait" : "pointer", opacity: isSaving ? 0.7 : 1 }}>ไม่อนุมัติ</button>
                        </>
                      ) : (
                        <button type="button" disabled={isSaving} onClick={() => void saveMember(member)} style={{ minWidth: 100, height: 44, padding: "0 16px", border: 0, borderRadius: 12, color: "#ffffff", background: "linear-gradient(135deg, #1877f2, #3799ff)", fontWeight: 800, cursor: isSaving ? "wait" : "pointer", opacity: isSaving ? 0.7 : 1 }}>{isSaving ? "กำลังบันทึก..." : "บันทึก"}</button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
