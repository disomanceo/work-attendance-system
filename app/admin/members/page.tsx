"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCachedProfileImageUrl } from "@/lib/profile-image-cache";
import { createClient } from "@/lib/supabase/client";

type MemberRole = "admin" | "director" | "teacher" | "staff" | "janitor";
type AccountStatus = "pending" | "active" | "suspended";
type WorkPermission = "budget.procurement" | "budget.finance";
type Department =
  | "academic_administration"
  | "budget_administration"
  | "personnel_administration"
  | "general_administration";
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
  alternate_workplace: string | null;
  count_as_present_when_no_checkin: boolean;
  profile_image_file_id: string | null;
  signature_file_id: string | null;
  work_permissions: WorkPermission[];
  departments: Department[];
};

type MembersResponse = {
  ok: boolean;
  members?: Member[];
  member?: Member;
  message?: string;
};

const memberSignatureUrlCache = new Map<string, string>();
const pendingMemberSignatureRequests = new Map<string, Promise<string>>();

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
  { value: "all", label: "ทั้งหมด" },
  { value: "pending", label: "รออนุมัติ" },
  { value: "active", label: "อนุมัติแล้ว" },
  { value: "suspended", label: "ระงับการใช้งาน" },
];

const workPermissionOptions: Array<{
  value: WorkPermission;
  label: string;
}> = [
  { value: "budget.procurement", label: "เจ้าหน้าที่พัสดุ" },
  { value: "budget.finance", label: "เจ้าหน้าที่การเงิน" },
];

const departmentOptions: Array<{ value: Department; label: string }> = [
  { value: "academic_administration", label: "ฝ่ายบริหารวิชาการ" },
  { value: "budget_administration", label: "ฝ่ายบริหารงบประมาณ" },
  { value: "personnel_administration", label: "ฝ่ายบริหารงานบุคคล" },
  { value: "general_administration", label: "ฝ่ายบริหารทั่วไป" },
];

async function getCachedMemberSignatureUrl(
  fileId: string | null | undefined,
  accessToken: string | null | undefined
) {
  if (!fileId || !accessToken) return "";

  const cachedUrl = memberSignatureUrlCache.get(fileId);
  if (cachedUrl) return cachedUrl;

  const pendingRequest = pendingMemberSignatureRequests.get(fileId);
  if (pendingRequest) return pendingRequest;

  const request = fetch(
    `/api/admin/member-signature?fileId=${encodeURIComponent(fileId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  )
    .then(async (response) => {
      if (!response.ok) return "";
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      memberSignatureUrlCache.set(fileId, objectUrl);
      return objectUrl;
    })
    .finally(() => pendingMemberSignatureRequests.delete(fileId));

  pendingMemberSignatureRequests.set(fileId, request);
  return request;
}

function normalizeMember(member: Member): Member {
  return {
    ...member,
    work_permissions: Array.isArray(member.work_permissions)
      ? member.work_permissions
      : [],
    departments: Array.isArray(member.departments) ? member.departments : [],
  };
}

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

function getRoleLabel(role: MemberRole) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

function getStatusLabel(status: AccountStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function statusTone(status: AccountStatus) {
  if (status === "active") {
    return {
      color: "#166534",
      background: "#dcfce7",
      border: "#86efac",
    };
  }

  if (status === "suspended") {
    return {
      color: "#991b1b",
      background: "#fee2e2",
      border: "#fca5a5",
    };
  }

  return {
    color: "#92400e",
    background: "#fef3c7",
    border: "#fcd34d",
  };
}

export default function AdminMembersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const initializedFilter = useRef(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [memberImageUrls, setMemberImageUrls] = useState<Record<string, string>>({});
  const [memberSignatureUrls, setMemberSignatureUrls] = useState<Record<string, string>>({});
  const [signaturePreviewMember, setSignaturePreviewMember] = useState<Member | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [activeFilter, setActiveFilter] = useState<MemberFilter>("all");
  const [expandedMemberId, setExpandedMemberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

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

      const nextMembers = (result.members ?? []).map(normalizeMember);
      setMembers(nextMembers);

      if (!initializedFilter.current) {
        const pendingCount = nextMembers.filter(
          (member) => member.account_status === "pending"
        ).length;
        setActiveFilter(pendingCount > 0 ? "pending" : "all");
        initializedFilter.current = true;
      }

      const imageEntries = await Promise.all(
        nextMembers
          .filter((member) => Boolean(member.profile_image_file_id))
          .map(async (member) => [
            member.id,
            await getCachedProfileImageUrl(
              member.profile_image_file_id,
              session.access_token
            ),
          ] as const)
      );
      setMemberImageUrls(
        Object.fromEntries(imageEntries.filter((entry) => Boolean(entry[1])))
      );

      const signatureEntries = await Promise.all(
        nextMembers
          .filter((member) => Boolean(member.signature_file_id))
          .map(async (member) => [
            member.id,
            await getCachedMemberSignatureUrl(
              member.signature_file_id,
              session.access_token
            ),
          ] as const)
      );
      setMemberSignatureUrls(
        Object.fromEntries(signatureEntries.filter((entry) => Boolean(entry[1])))
      );
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

  const counts = useMemo(
    () => ({
      all: members.length,
      pending: members.filter((member) => member.account_status === "pending")
        .length,
      active: members.filter((member) => member.account_status === "active")
        .length,
      suspended: members.filter(
        (member) => member.account_status === "suspended"
      ).length,
    }),
    [members]
  );

  const filteredMembers = useMemo(() => {
    if (activeFilter === "all") return members;
    return members.filter((member) => member.account_status === activeFilter);
  }, [activeFilter, members]);

  function updateLocalMember<K extends keyof Member>(
    id: string,
    key: K,
    value: Member[K]
  ) {
    setMembers((current) =>
      current.map((member) =>
        member.id === id ? { ...member, [key]: value } : member
      )
    );
  }

  function toggleMemberArrayValue<T extends WorkPermission | Department>(
    memberId: string,
    key: "work_permissions" | "departments",
    value: T,
    checked: boolean
  ) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member;

        const currentValues = member[key] ?? [];
        const nextValues = checked
          ? Array.from(new Set([...currentValues, value]))
          : currentValues.filter((item) => item !== value);

        return { ...member, [key]: nextValues };
      })
    );
  }

  async function saveMember(
    member: Member,
    overrides?: Partial<
      Pick<
        Member,
        | "role"
        | "account_status"
        | "position"
        | "alternate_workplace"
        | "count_as_present_when_no_checkin"
        | "work_permissions"
        | "departments"
      >
    >,
    successMessage?: string
  ) {
    const nextMember = { ...member, ...overrides };
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
          id: nextMember.id,
          role: nextMember.role,
          accountStatus: nextMember.account_status,
          position: nextMember.position ?? "",
          alternateWorkplace: nextMember.alternate_workplace ?? "",
          countAsPresentWhenNoCheckin:
            nextMember.count_as_present_when_no_checkin,
          workPermissions: nextMember.work_permissions,
          departments: nextMember.departments,
        }),
      });

      const result = (await response.json()) as MembersResponse;

      if (!response.ok || !result.ok || !result.member) {
        throw new Error(result.message || "ไม่สามารถบันทึกข้อมูลสมาชิกได้");
      }

      const savedMember = normalizeMember(result.member);
      setMembers((current) =>
        current.map((item) => (item.id === savedMember.id ? savedMember : item))
      );
      setMessageType("success");
      setMessage(
        successMessage ||
          result.message ||
          "บันทึกข้อมูลสมาชิกเรียบร้อยแล้ว"
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

  async function deleteMember(member: Member) {
    if (member.id === currentUserId) {
      setMessageType("error");
      setMessage("ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่");
      return;
    }

    const confirmed = window.confirm(
      `ยืนยันลบสมาชิก ${member.full_name}?\nการลบนี้จะลบบัญชีเข้าสู่ระบบและซ่อนข้อมูลสมาชิก`
    );
    if (!confirmed) return;

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
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: member.id }),
      });

      const result = (await response.json()) as MembersResponse & {
        deletedId?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถลบสมาชิกได้");
      }

      setMembers((current) =>
        current.filter((item) => item.id !== member.id)
      );
      setMessageType("success");
      setMessage(result.message || `ลบสมาชิก ${member.full_name} เรียบร้อยแล้ว`);
    } catch (error) {
      console.error("Delete member error:", error);
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดระหว่างลบสมาชิก"
      );
    } finally {
      setSavingId("");
    }
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "#ffffff",
        }}
      >
        กำลังโหลดรายชื่อสมาชิก...
      </main>
    );
  }

  return (
    <main style={{ width: "100%", minHeight: "100vh", padding: "18px 16px 28px", background: "#f4f6fb" }}>
      <section
        style={{
          width: "min(1420px, 100%)",
          margin: "0 auto",
          display: "grid",
          gap: 14,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                color: "#172033",
                fontSize: "clamp(22px, 2vw, 30px)",
              }}
            >
              จัดการสมาชิก
            </h1>
            <p
              style={{
                margin: "3px 0 0",
                color: "#667085",
                fontSize: 13,
              }}
            >
              จัดการบทบาท สิทธิ์งาน ฝ่ายสังกัด และสถานะบัญชี
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void loadMembers()}
              style={{
                height: 38,
                padding: "0 13px",
                border: "1px solid #d7dce5",
                borderRadius: 10,
                color: "#344054",
                background: "#ffffff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              โหลดใหม่
            </button>
            <button
              type="button"
              onClick={() => router.push("/attendance")}
              style={{
                height: 38,
                padding: "0 13px",
                border: 0,
                borderRadius: 10,
                color: "#ffffff",
                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                color: "#ffffff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              กลับหน้าหลัก
            </button>
          </div>
        </header>

        <nav
          style={{
            display: "flex",
            gap: 7,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {filterOptions.map((option) => {
            const selected = activeFilter === option.value;
            const count = counts[option.value];

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setActiveFilter(option.value)}
                style={{
                  minHeight: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 11px",
                  border: selected
                    ? "1px solid #8b5cf6"
                    : "1px solid #d7dce5",
                  borderRadius: 999,
                  color: selected ? "#6d28d9" : "#475467",
                  background: selected ? "#f3e8ff" : "#ffffff",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {option.label}
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    display: "inline-grid",
                    placeItems: "center",
                    padding: "0 6px",
                    borderRadius: 999,
                    color:
                      option.value === "pending" && count > 0
                        ? "#ffffff"
                        : "#4c1d95",
                    background:
                      option.value === "pending" && count > 0
                        ? "#ef4444"
                        : "#f3e8ff",
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </nav>

        {message && (
          <div
            role="alert"
            style={{
              padding: "10px 12px",
              border:
                messageType === "success"
                  ? "1px solid #86efac"
                  : "1px solid #fca5a5",
              borderRadius: 10,
              color: messageType === "success" ? "#166534" : "#991b1b",
              background: messageType === "success" ? "#dcfce7" : "#fee2e2",
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.45,
            }}
          >
            {message}
          </div>
        )}

        {filteredMembers.length === 0 ? (
          <div
            style={{
              padding: 30,
              border: "1px dashed #cfd6e2",
              borderRadius: 14,
              color: "#667085",
              background: "#ffffff",
              textAlign: "center",
            }}
          >
            ไม่มีสมาชิกในรายการนี้
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filteredMembers.map((member) => {
              const isCurrentUser = member.id === currentUserId;
              const isPending = member.account_status === "pending";
              const isSaving = savingId === member.id;
              const isExpanded = expandedMemberId === member.id;
              const memberImageUrl = memberImageUrls[member.id] ?? "";
              const memberSignatureUrl = memberSignatureUrls[member.id] ?? "";
              const tone = statusTone(member.account_status);
              const initials =
                member.full_name
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part.charAt(0))
                  .join("")
                  .toUpperCase() || "?";

              return (
                <article
                  key={member.id}
                  style={{
                    border: isPending
                      ? "1px solid #f0b94d"
                      : "1px solid #dfe4ec",
                    borderRadius: 15,
                    background: "#ffffff",
                    boxShadow: "0 4px 14px rgba(30,41,59,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(240px, 1.3fr) repeat(3, minmax(150px, 0.75fr)) auto",
                      gap: 10,
                      alignItems: "center",
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          flex: "0 0 44px",
                          display: "grid",
                          placeItems: "center",
                          overflow: "hidden",
                          border: "1px solid #d9dfea",
                          borderRadius: "50%",
                          color: "#6d28d9",
                          background: "#f3e8ff",
                          fontWeight: 900,
                        }}
                      >
                        {memberImageUrl ? (
                          <img
                            src={memberImageUrl}
                            alt={`รูปโปรไฟล์ ${member.full_name}`}
                            loading="lazy"
                            decoding="async"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          initials
                        )}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            minWidth: 0,
                          }}
                        >
                          <strong
                            style={{
                              overflow: "hidden",
                              color: "#172033",
                              fontSize: 15,
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {member.full_name}
                          </strong>

                          {isCurrentUser && (
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 999,
                                color: "#ddd6fe",
                                background: "rgba(124,58,237,0.28)",
                                fontSize: 10,
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                              }}
                            >
                              คุณ
                            </span>
                          )}

                          {!isCurrentUser && (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => void deleteMember(member)}
                              aria-label={`ลบสมาชิก ${member.full_name}`}
                              title={`ลบสมาชิก ${member.full_name}`}
                              style={{
                                width: 26,
                                height: 26,
                                flex: "0 0 26px",
                                display: "grid",
                                placeItems: "center",
                                border: "2px solid #dc2626",
                                borderRadius: "50%",
                                color: "#ffffff",
                                background: "#dc2626",
                                boxShadow: "0 2px 6px rgba(220,38,38,0.28)",
                                fontSize: 18,
                                fontWeight: 900,
                                lineHeight: 1,
                                cursor: isSaving ? "wait" : "pointer",
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>

                        <div
                          style={{
                            marginTop: 3,
                            display: "flex",
                            gap: 7,
                            flexWrap: "wrap",
                            color: "#667085",
                            fontSize: 11,
                          }}
                        >
                          <span>{formatThaiPhone(member.phone)}</span>
                          <span>•</span>
                          <span>{getRoleLabel(member.role)}</span>
                          <span
                            style={{
                              padding: "1px 6px",
                              border: `1px solid ${tone.border}`,
                              borderRadius: 999,
                              color: tone.color,
                              background: tone.background,
                              fontWeight: 800,
                            }}
                          >
                            {getStatusLabel(member.account_status)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <label style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          marginBottom: 4,
                          color: "#667085",
                          fontSize: 11,
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
                          height: 36,
                          padding: "0 9px",
                          border: "1px solid #cfd6e2",
                          borderRadius: 9,
                          color: "#172033",
                          background: "#ffffff",
                          outline: "none",
                        }}
                      />
                    </label>

                    <label style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          marginBottom: 4,
                          color: "#667085",
                          fontSize: 11,
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
                          height: 36,
                          padding: "0 9px",
                          border: "1px solid #cfd6e2",
                          borderRadius: 9,
                          color: "#172033",
                          background: "#ffffff",
                        }}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          marginBottom: 4,
                          color: "#667085",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        สถานะ
                      </span>
                      <select
                        value={member.account_status}
                        disabled={isCurrentUser || isPending}
                        onChange={(event) =>
                          updateLocalMember(
                            member.id,
                            "account_status",
                            event.target.value as AccountStatus
                          )
                        }
                        style={{
                          width: "100%",
                          height: 36,
                          padding: "0 9px",
                          border: "1px solid #cfd6e2",
                          borderRadius: 9,
                          color: "#172033",
                          background: "#ffffff",
                        }}
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedMemberId(isExpanded ? "" : member.id)
                      }
                      style={{
                        height: 36,
                        padding: "0 11px",
                        border: "1px solid #d7dce5",
                        borderRadius: 9,
                        color: "#5b21b6",
                        background: "#f8f5ff",
                        fontWeight: 800,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isExpanded ? "ย่อ" : "สิทธิ์/เพิ่มเติม"}
                    </button>
                  </div>

                  {isExpanded && (
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        padding: "0 12px 12px",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(210px, 1fr))",
                          gap: 8,
                        }}
                      >
                        <section
                          style={{
                            padding: 10,
                            border: "1px solid #e0e5ed",
                            borderRadius: 11,
                            background: "#f8fafc",
                          }}
                        >
                          <strong
                            style={{
                              color: "#344054",
                              fontSize: 12,
                            }}
                          >
                            สิทธิ์งาน
                          </strong>
                          <div
                            style={{
                              display: "flex",
                              gap: 7,
                              flexWrap: "wrap",
                              marginTop: 7,
                            }}
                          >
                            {workPermissionOptions.map((option) => {
                              const checked = member.work_permissions.includes(
                                option.value
                              );

                              return (
                                <label
                                  key={option.value}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    minHeight: 30,
                                    padding: "4px 8px",
                                    border: checked
                                      ? "1px solid #8b5cf6"
                                      : "1px solid #d7dce5",
                                    borderRadius: 999,
                                    color: checked ? "#5b21b6" : "#475467",
                                    background: checked ? "#f3e8ff" : "#ffffff",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) =>
                                      toggleMemberArrayValue(
                                        member.id,
                                        "work_permissions",
                                        option.value,
                                        event.target.checked
                                      )
                                    }
                                    style={{
                                      width: 13,
                                      height: 13,
                                      margin: 0,
                                      accentColor: "#c084fc",
                                    }}
                                  />
                                  {option.label}
                                </label>
                              );
                            })}
                          </div>
                        </section>

                        <section
                          style={{
                            padding: 10,
                            border: "1px solid #e0e5ed",
                            borderRadius: 11,
                            background: "#f8fafc",
                          }}
                        >
                          <strong
                            style={{
                              color: "#344054",
                              fontSize: 12,
                            }}
                          >
                            ฝ่ายสังกัด
                          </strong>
                          <div
                            style={{
                              display: "flex",
                              gap: 7,
                              flexWrap: "wrap",
                              marginTop: 7,
                            }}
                          >
                            {departmentOptions.map((option) => {
                              const checked = member.departments.includes(
                                option.value
                              );

                              return (
                                <label
                                  key={option.value}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    minHeight: 30,
                                    padding: "4px 8px",
                                    border: checked
                                      ? "1px solid #8b5cf6"
                                      : "1px solid #d7dce5",
                                    borderRadius: 999,
                                    color: checked ? "#5b21b6" : "#475467",
                                    background: checked ? "#f3e8ff" : "#ffffff",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) =>
                                      toggleMemberArrayValue(
                                        member.id,
                                        "departments",
                                        option.value,
                                        event.target.checked
                                      )
                                    }
                                    style={{
                                      width: 13,
                                      height: 13,
                                      margin: 0,
                                      accentColor: "#c084fc",
                                    }}
                                  />
                                  {option.label}
                                </label>
                              );
                            })}
                          </div>
                        </section>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "minmax(220px, 1fr) auto",
                          gap: 8,
                          alignItems: "end",
                        }}
                      >
                        <label style={{ minWidth: 0 }}>
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              marginBottom: 4,
                              color: "#667085",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                member.count_as_present_when_no_checkin
                              }
                              onChange={(event) =>
                                updateLocalMember(
                                  member.id,
                                  "count_as_present_when_no_checkin",
                                  event.target.checked
                                )
                              }
                              style={{
                                width: 14,
                                height: 14,
                                margin: 0,
                                accentColor: "#c084fc",
                              }}
                            />
                            ปฏิบัติงานหลายสถานที่
                          </span>
                          <input
                            type="text"
                            value={member.alternate_workplace ?? ""}
                            disabled={
                              !member.count_as_present_when_no_checkin
                            }
                            maxLength={200}
                            placeholder="ระบุสถานที่ปฏิบัติงานเพิ่มเติม"
                            onChange={(event) =>
                              updateLocalMember(
                                member.id,
                                "alternate_workplace",
                                event.target.value
                              )
                            }
                            style={{
                              width: "100%",
                              height: 36,
                              padding: "0 9px",
                              border: "1px solid #cfd6e2",
                              borderRadius: 9,
                              color: "#172033",
                              background: member.count_as_present_when_no_checkin ? "#ffffff" : "#eef1f5",
                              outline: "none",
                            }}
                          />
                        </label>

                        <div
                          style={{
                            display: "flex",
                            gap: 7,
                            flexWrap: "wrap",
                          }}
                        >
                          {member.signature_file_id && (
                            <button
                              type="button"
                              disabled={!memberSignatureUrl}
                              onClick={() =>
                                setSignaturePreviewMember(member)
                              }
                              style={{
                                height: 36,
                                padding: "0 11px",
                                border: "1px solid rgba(196,181,253,0.45)",
                                borderRadius: 9,
                                color: "#ffffff",
                                background: "rgba(124,58,237,0.2)",
                                fontWeight: 800,
                                cursor: memberSignatureUrl
                                  ? "pointer"
                                  : "wait",
                              }}
                            >
                              ลายเซ็น
                            </button>
                          )}

                          {isPending ? (
                            <>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  void saveMember(
                                    member,
                                    { account_status: "active" },
                                    `อนุมัติ ${member.full_name} เรียบร้อยแล้ว`
                                  )
                                }
                                style={{
                                  height: 36,
                                  padding: "0 12px",
                                  border: 0,
                                  borderRadius: 9,
                                  color: "#ffffff",
                                  background: "#16a34a",
                                  fontWeight: 800,
                                  cursor: isSaving ? "wait" : "pointer",
                                }}
                              >
                                {isSaving ? "กำลังบันทึก..." : "อนุมัติ"}
                              </button>

                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  void saveMember(
                                    member,
                                    { account_status: "suspended" },
                                    `ไม่อนุมัติ ${member.full_name}`
                                  )
                                }
                                style={{
                                  height: 36,
                                  padding: "0 12px",
                                  border: "1px solid rgba(248,113,113,0.6)",
                                  borderRadius: 9,
                                  color: "#fecaca",
                                  background: "rgba(220,38,38,0.18)",
                                  fontWeight: 800,
                                  cursor: isSaving ? "wait" : "pointer",
                                }}
                              >
                                ไม่อนุมัติ
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => void saveMember(member)}
                              style={{
                                height: 36,
                                padding: "0 13px",
                                border: 0,
                                borderRadius: 9,
                                color: "#ffffff",
                                background:
                                  "linear-gradient(135deg, #7c3aed, #a855f7)",
                                color: "#ffffff",
                                fontWeight: 800,
                                cursor: isSaving ? "wait" : "pointer",
                              }}
                            >
                              {isSaving ? "กำลังบันทึก..." : "บันทึก"}
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          color: "#98a2b3",
                          fontSize: 10,
                        }}
                      >
                        สมัครเมื่อ {formatThaiDate(member.created_at)}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <style jsx>{`
        @media (max-width: 1050px) {
          article > div:first-child {
            grid-template-columns: minmax(220px, 1fr) minmax(150px, 0.8fr) minmax(150px, 0.8fr) !important;
          }

          article > div:first-child > button:last-child {
            grid-column: 3;
          }
        }

        @media (max-width: 760px) {
          main {
            padding: 14px 10px 24px !important;
          }

          article > div:first-child {
            grid-template-columns: 1fr !important;
            align-items: stretch !important;
          }

          article > div:first-child > button:last-child {
            grid-column: auto;
          }
        }
      `}</style>

      {signaturePreviewMember && (
        <div
          role="presentation"
          onClick={() => setSignaturePreviewMember(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(2,6,23,0.72)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              padding: 16,
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 16,
              background: "#ffffff",
              boxShadow: "0 28px 70px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <strong style={{ color: "#111827" }}>
                ลายเซ็นของ {signaturePreviewMember.full_name}
              </strong>
              <button
                type="button"
                onClick={() => setSignaturePreviewMember(null)}
                style={{
                  width: 30,
                  height: 30,
                  border: "1px solid #fecaca",
                  borderRadius: "50%",
                  color: "#b91c1c",
                  background: "#fff1f2",
                  fontSize: 18,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                minHeight: 190,
                display: "grid",
                placeItems: "center",
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
              }}
            >
              <img
                src={memberSignatureUrls[signaturePreviewMember.id]}
                alt={`ลายเซ็นของ ${signaturePreviewMember.full_name}`}
                style={{
                  width: "100%",
                  maxHeight: 270,
                  objectFit: "contain",
                }}
              />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
