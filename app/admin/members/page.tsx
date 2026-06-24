"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MemberRole =
  | "admin"
  | "director"
  | "teacher"
  | "staff"
  | "janitor";

type AccountStatus = "pending" | "active" | "suspended";

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

const roleOptions: Array<{
  value: MemberRole;
  label: string;
}> = [
  { value: "admin", label: "ผู้ดูแลระบบ" },
  { value: "director", label: "ผู้บริหาร" },
  { value: "teacher", label: "ครู" },
  { value: "staff", label: "เจ้าหน้าที่" },
  { value: "janitor", label: "ภารโรง" },
];

const statusOptions: Array<{
  value: AccountStatus;
  label: string;
}> = [
  { value: "pending", label: "รออนุมัติ" },
  { value: "active", label: "ใช้งานได้" },
  { value: "suspended", label: "ระงับการใช้งาน" },
];

function formatThaiPhone(phone: string) {
  if (phone.startsWith("66") && phone.length === 11) {
    return `0${phone.slice(2)}`;
  }

  return phone;
}

function getStatusLabel(status: AccountStatus) {
  return (
    statusOptions.find((option) => option.value === status)?.label ??
    status
  );
}

function getRoleLabel(role: MemberRole) {
  return (
    roleOptions.find((option) => option.value === role)?.label ??
    role
  );
}

export default function AdminMembersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error"
  >("success");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        router.replace("/login");
        return;
      }

      setCurrentUserId(session.user.id);

      const response = await fetch("/api/admin/members", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
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
          router.replace("/dashboard");
          return;
        }

        throw new Error(
          result.message || "ไม่สามารถโหลดข้อมูลสมาชิกได้"
        );
      }

      setMembers(result.members ?? []);
    } catch (error) {
      console.error("Load members page error:", error);

      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดระหว่างโหลดข้อมูล"
      );
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  function updateLocalMember<K extends keyof Member>(
    id: string,
    key: K,
    value: Member[K]
  ) {
    setMembers((current) =>
      current.map((member) =>
        member.id === id
          ? {
              ...member,
              [key]: value,
            }
          : member
      )
    );
  }

  async function saveMember(member: Member) {
    setSavingId(member.id);
    setMessage("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

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
          id: member.id,
          role: member.role,
          accountStatus: member.account_status,
          position: member.position ?? "",
        }),
      });

      const result = (await response.json()) as MembersResponse;

      if (!response.ok || !result.ok || !result.member) {
        throw new Error(
          result.message || "ไม่สามารถบันทึกข้อมูลสมาชิกได้"
        );
      }

      setMembers((current) =>
        current.map((item) =>
          item.id === result.member?.id
            ? result.member
            : item
        )
      );

      setMessageType("success");
      setMessage(
        result.message || "บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว"
      );
    } catch (error) {
      console.error("Save member error:", error);

      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดระหว่างบันทึกข้อมูล"
      );
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

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
          >
            กลับ Dashboard
          </button>

          <button type="button" onClick={handleLogout}>
            ออกจากระบบ
          </button>
        </div>
      </header>

      <section
        style={{
          marginTop: 32,
          padding: 24,
          border: "1px solid #d8e2ed",
          borderRadius: 24,
          background: "#ffffff",
          boxShadow: "0 18px 45px rgba(28, 60, 93, 0.08)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: "#071d32",
                fontSize: 24,
              }}
            >
              รายชื่อสมาชิกทั้งหมด
            </h2>

            <p
              style={{
                margin: "6px 0 0",
                color: "#667085",
              }}
            >
              สมาชิกทั้งหมด {members.length} คน
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadMembers()}
            style={{
              padding: "11px 17px",
              border: "1px solid #cfdbe7",
              borderRadius: 13,
              background: "#ffffff",
              color: "#102a43",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            โหลดข้อมูลใหม่
          </button>
        </div>

        {message && (
          <div
            role="alert"
            style={{
              marginBottom: 20,
              padding: "13px 15px",
              borderRadius: 14,
              border:
                messageType === "success"
                  ? "1px solid #a7e3ba"
                  : "1px solid #f2b8b8",
              color:
                messageType === "success"
                  ? "#146c2e"
                  : "#c81e1e",
              background:
                messageType === "success"
                  ? "#f1fff5"
                  : "#fff5f5",
              fontWeight: 700,
            }}
          >
            {message}
          </div>
        )}

        {members.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "#667085",
            }}
          >
            ยังไม่มีข้อมูลสมาชิก
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 16,
            }}
          >
            {members.map((member) => {
              const isCurrentUser =
                member.id === currentUserId;

              return (
                <article
                  key={member.id}
                  style={{
                    padding: 20,
                    border: "1px solid #d8e2ed",
                    borderRadius: 20,
                    background: "#fbfdff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(220px, 1.3fr) repeat(3, minmax(150px, 1fr)) auto",
                      gap: 14,
                      alignItems: "end",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            color: "#071d32",
                            fontSize: 18,
                          }}
                        >
                          {member.full_name}
                        </h3>

                        {isCurrentUser && (
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              color: "#0b5ed7",
                              background: "#e8f3ff",
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            บัญชีของคุณ
                          </span>
                        )}
                      </div>

                      <p
                        style={{
                          margin: "8px 0 0",
                          color: "#667085",
                        }}
                      >
                        {formatThaiPhone(member.phone)}
                      </p>

                      <p
                        style={{
                          margin: "5px 0 0",
                          color: "#98a2b3",
                          fontSize: 13,
                        }}
                      >
                        {getRoleLabel(member.role)} ·{" "}
                        {getStatusLabel(
                          member.account_status
                        )}
                      </p>
                    </div>

                    <label>
                      <span
                        style={{
                          display: "block",
                          marginBottom: 7,
                          color: "#344054",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        ตำแหน่ง
                      </span>

                      <input
                        type="text"
                        value={member.position ?? ""}
                        maxLength={150}
                        onChange={(event) =>
                          updateLocalMember(
                            member.id,
                            "position",
                            event.target.value
                          )
                        }
                        style={{
                          width: "100%",
                          height: 44,
                          padding: "0 12px",
                          border: "1px solid #d8e2ed",
                          borderRadius: 12,
                          outline: "none",
                          background: "#ffffff",
                        }}
                      />
                    </label>

                    <label>
                      <span
                        style={{
                          display: "block",
                          marginBottom: 7,
                          color: "#344054",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        บทบาท
                      </span>

                      <select
                        value={member.role}
                        disabled={isCurrentUser}
                        onChange={(event) =>
                          updateLocalMember(
                            member.id,
                            "role",
                            event.target.value as MemberRole
                          )
                        }
                        style={{
                          width: "100%",
                          height: 44,
                          padding: "0 12px",
                          border: "1px solid #d8e2ed",
                          borderRadius: 12,
                          background: isCurrentUser
                            ? "#eef2f6"
                            : "#ffffff",
                        }}
                      >
                        {roleOptions.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span
                        style={{
                          display: "block",
                          marginBottom: 7,
                          color: "#344054",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        สถานะ
                      </span>

                      <select
                        value={member.account_status}
                        disabled={isCurrentUser}
                        onChange={(event) =>
                          updateLocalMember(
                            member.id,
                            "account_status",
                            event.target
                              .value as AccountStatus
                          )
                        }
                        style={{
                          width: "100%",
                          height: 44,
                          padding: "0 12px",
                          border: "1px solid #d8e2ed",
                          borderRadius: 12,
                          background: isCurrentUser
                            ? "#eef2f6"
                            : "#ffffff",
                        }}
                      >
                        {statusOptions.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      disabled={savingId === member.id}
                      onClick={() => void saveMember(member)}
                      style={{
                        minWidth: 100,
                        height: 44,
                        padding: "0 16px",
                        border: 0,
                        borderRadius: 12,
                        color: "#ffffff",
                        background:
                          "linear-gradient(135deg, #1877f2, #3799ff)",
                        fontWeight: 800,
                        cursor:
                          savingId === member.id
                            ? "wait"
                            : "pointer",
                        opacity:
                          savingId === member.id ? 0.7 : 1,
                      }}
                    >
                      {savingId === member.id
                        ? "กำลังบันทึก..."
                        : "บันทึก"}
                    </button>
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