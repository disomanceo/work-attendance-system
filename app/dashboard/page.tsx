"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  full_name: string;
  phone: string;
  position: string | null;
  role: string;
  account_status: string;
};

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: "ผู้ดูแลระบบ",
    director: "ผู้บริหาร",
    teacher: "ครู",
    staff: "เจ้าหน้าที่",
    janitor: "ภารโรง",
  };

  return labels[role] ?? role;
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "รออนุมัติ",
    active: "ใช้งานได้",
    suspended: "ระงับการใช้งาน",
  };

  return labels[status] ?? status;
}

function formatThaiPhone(phone: string) {
  if (phone.startsWith("66") && phone.length === 11) {
    return `0${phone.slice(2)}`;
  }

  return phone;
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      setLoading(true);
      setMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "full_name, phone, position, role, account_status"
        )
        .eq("id", user.id)
        .single();

      if (error || !data) {
        console.error("Load profile error:", error);

        if (mounted) {
          setMessage(
            "ไม่พบข้อมูลสมาชิก กรุณาติดต่อผู้ดูแลระบบ"
          );
          setLoading(false);
        }

        return;
      }

      if (data.account_status !== "active") {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (mounted) {
        setProfile(data);
        setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function openAttendance() {
    router.push("/attendance");
  }

  function openAttendanceHistory() {
    router.push("/attendance/history");
  }

  if (loading) {
    return (
      <main className="dashboard-loading">
        <span className="spinner dark" />
        กำลังโหลดข้อมูลสมาชิก...
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p>WORK ATTENDANCE</p>
          <h1>ระบบลงเวลาปฏิบัติงาน</h1>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={openAttendance}
            style={{
              borderColor: "#16a34a",
              color: "#ffffff",
              background:
                "linear-gradient(135deg, #16a34a, #22c55e)",
            }}
          >
            ลงเวลาปฏิบัติงาน
          </button>

          <button
            type="button"
            onClick={openAttendanceHistory}
          >
            ประวัติการลงเวลา
          </button>

          {["admin", "director"].includes(profile?.role ?? "") && (
            <button
              type="button"
              onClick={() => router.push("/admin/members")}
              style={{
                borderColor: "#1877f2",
                color: "#ffffff",
                background:
                  "linear-gradient(135deg, #1877f2, #3799ff)",
              }}
            >
              จัดการสมาชิก
            </button>
          )}

          <button type="button" onClick={handleLogout}>
            ออกจากระบบ
          </button>
        </div>
      </header>

      {message && (
        <section
          className="welcome-card"
          style={{
            border: "1px solid #fecaca",
            color: "#c81e1e",
            background: "#fff7f7",
          }}
        >
          <div className="avatar">!</div>

          <div>
            <p style={{ color: "#c81e1e" }}>
              ไม่สามารถโหลดข้อมูลสมาชิก
            </p>

            <h2 style={{ color: "#c81e1e" }}>
              กรุณาตรวจสอบข้อมูล
            </h2>

            <span style={{ color: "#c81e1e" }}>
              {message}
            </span>
          </div>
        </section>
      )}

      {profile && (
        <>
          <section className="welcome-card">
            <div className="avatar">👤</div>

            <div>
              <p>ยินดีต้อนรับ</p>
              <h2>{profile.full_name}</h2>
              <span>{formatThaiPhone(profile.phone)}</span>
            </div>
          </section>

          <section className="dashboard-grid">
            <article>
              <span>✓</span>
              <h3>สถานะสมาชิก</h3>
              <p>{getStatusLabel(profile.account_status)}</p>
            </article>

            <article>
              <span>👤</span>
              <h3>บทบาท</h3>
              <p>{getRoleLabel(profile.role)}</p>
            </article>

            <article>
              <span>🏫</span>
              <h3>ตำแหน่ง</h3>
              <p>{profile.position || "ยังไม่ได้กำหนด"}</p>
            </article>

            <article
              role="button"
              tabIndex={0}
              onClick={openAttendance}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === " "
                ) {
                  openAttendance();
                }
              }}
              style={{
                cursor: "pointer",
                borderColor: "#9ed7ae",
                background:
                  "linear-gradient(145deg, #ffffff, #f1fff5)",
              }}
            >
              <span>📍</span>
              <h3>ลงเวลาปฏิบัติงาน</h3>
              <p>
                ตรวจสอบตำแหน่ง ลงเวลาเข้า
                และลงเวลาออก
              </p>
            </article>

            <article
              role="button"
              tabIndex={0}
              onClick={openAttendanceHistory}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === " "
                ) {
                  openAttendanceHistory();
                }
              }}
              style={{
                cursor: "pointer",
                borderColor: "#c5b4f4",
                background:
                  "linear-gradient(145deg, #ffffff, #f6f2ff)",
              }}
            >
              <span>📅</span>
              <h3>ประวัติการลงเวลา</h3>
              <p>
                ดูเวลาเข้า–ออก มาสาย
                และออกก่อนเวลาย้อนหลัง
              </p>
            </article>

            {["admin", "director"].includes(profile.role) && (
              <article
                role="button"
                tabIndex={0}
                onClick={() =>
                  router.push("/admin/members")
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    router.push("/admin/members");
                  }
                }}
                style={{
                  cursor: "pointer",
                  borderColor: "#a9ccff",
                  background:
                    "linear-gradient(145deg, #ffffff, #eef7ff)",
                }}
              >
                <span>⚙️</span>
                <h3>จัดการสมาชิก</h3>
                <p>
                  อนุมัติสมาชิก กำหนดบทบาท ตำแหน่ง
                  และสถานะบัญชี
                </p>
              </article>
            )}
          </section>
        </>
      )}
    </main>
  );
}
