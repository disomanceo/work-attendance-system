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
        .select("full_name, phone, position, role, account_status")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Load profile error:", error);

        setMessage(
          "ไม่พบข้อมูลสมาชิก กรุณาติดต่อผู้ดูแลระบบหรือลองสมัครสมาชิกใหม่"
        );
        setLoading(false);
        return;
      }

      setProfile(data);
      setLoading(false);
    }

    void loadProfile();
  }, [router, supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
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

        <button type="button" onClick={handleLogout}>
          ออกจากระบบ
        </button>
      </header>

      {message && (
        <section
          className="welcome-card"
          style={{
            borderColor: "#fecaca",
            background: "#fff7f7",
          }}
        >
          <div className="avatar">!</div>

          <div>
            <p>ไม่สามารถโหลดข้อมูลสมาชิก</p>
            <h2>กรุณาตรวจสอบข้อมูล</h2>
            <span>{message}</span>
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

            <article>
              <span>◷</span>
              <h3>ระบบลงเวลา</h3>
              <p>กำลังเตรียมเปิดใช้งานในขั้นตอนถัดไป</p>
            </article>
          </section>
        </>
      )}
    </main>
  );
}