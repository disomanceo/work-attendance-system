"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./AppShell.module.css";

type Profile = {
  full_name: string;
  position: string | null;
  role: string;
  account_status: string;
  profile_image_file_id: string | null;
};

type MenuItem = {
  label: string;
  icon: string;
  href: string;
  match: (pathname: string) => boolean;
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(
      window.localStorage.getItem("attendance_sidebar_collapsed") === "true"
    );
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "full_name, position, role, account_status, profile_image_file_id"
        )
        .eq("id", user.id)
        .single();

      if (error || !data || data.account_status !== "active") {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (active) {
        setProfile(data as Profile);
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    let objectUrl = "";

    async function loadProfileImage() {
      if (!profile?.profile_image_file_id) {
        setProfileImageUrl("");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const response = await fetch(
        `/api/account/profile-assets?fileId=${encodeURIComponent(
          profile.profile_image_file_id
        )}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      if (!response.ok) return;

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      setProfileImageUrl(objectUrl);
    }

    void loadProfileImage();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profile?.profile_image_file_id, supabase]);

  const role = profile?.role ?? "";
  const isManager = role === "admin" || role === "director";
  const reportHref = isManager ? "/admin/attendance" : "/attendance/history";

  const menuItems: MenuItem[] = [
    {
      label: "หน้าหลัก",
      icon: "◷",
      href: "/attendance",
      match: (value) => value === "/attendance",
    },
    {
      label: "การลงเวลาปฏิบัติงาน",
      icon: "▣",
      href: reportHref,
      match: (value) =>
        value.startsWith("/admin/attendance") ||
        value.startsWith("/attendance/history"),
    },
    {
      label: "ขออนุญาตลาป่วย-ลากิจ",
      icon: "▤",
      href: "/leave",
      match: (value) => value.startsWith("/leave"),
    },
    {
      label: "ขออนุญาตไปราชการ",
      icon: "✈",
      href: "/official-duty",
      match: (value) => value.startsWith("/official-duty"),
    },
    {
      label: "ข้อมูลส่วนตัว",
      icon: "♙",
      href: "/account/profile",
      match: (value) => value.startsWith("/account/profile"),
    },
  ];

  if (isManager) {
    menuItems.push(
      {
        label: "ตั้งค่า",
        icon: "⚙",
        href: "/admin/settings",
        match: (value) => value.startsWith("/admin/settings"),
      },
      {
        label: "จัดการสมาชิก",
        icon: "👥",
        href: "/admin/members",
        match: (value) => value.startsWith("/admin/members"),
      }
    );
  }

  function toggleCollapsed() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    window.localStorage.setItem("attendance_sidebar_collapsed", String(next));
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div
      className={`${styles.shell} ${
        sidebarCollapsed ? styles.shellCollapsed : ""
      }`}
    >
      <button
        type="button"
        className={styles.mobileMenuButton}
        aria-label="เปิดเมนูส่วนกลาง"
        onClick={() => setSidebarOpen(true)}
      >
        ☰
      </button>

      {sidebarOpen && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="ปิดเมนูส่วนกลาง"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`${styles.sidebar} ${
          sidebarOpen ? styles.sidebarOpen : ""
        } ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}
      >
        <div className={styles.sidebarBrand}>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={toggleCollapsed}
            aria-label={sidebarCollapsed ? "ขยายเมนู" : "ย่อเมนู"}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>

        <div className={styles.userCard}>
          <div className={styles.avatar}>
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="รูปโปรไฟล์" />
            ) : (
              profile?.full_name?.trim().charAt(0) || "U"
            )}
          </div>

          {!sidebarCollapsed && (
            <div className={styles.userInfo}>
              <strong>{profile?.full_name || "กำลังโหลด..."}</strong>
              <small>
                {profile?.position || getRoleLabel(profile?.role || "")}
              </small>
              <span>● ออนไลน์</span>
            </div>
          )}
        </div>

        {!sidebarCollapsed && (
          <h2 className={styles.menuTitle}>เมนูของฉัน</h2>
        )}

        <nav className={styles.menuList} aria-label="เมนูของฉัน">
          {menuItems.map((item) => {
            const active = item.match(pathname);

            return (
              <button
                type="button"
                key={item.label}
                className={`${styles.menuItem} ${
                  active ? styles.menuItemActive : ""
                }`}
                onClick={() => router.push(item.href)}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className={styles.menuIcon}>{item.icon}</span>
                {!sidebarCollapsed && <b>{item.label}</b>}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => void logout()}
        >
          <span>⇥</span>
          {!sidebarCollapsed && <b>ออกจากระบบ</b>}
        </button>
      </aside>

      <div className={styles.content}>{children}</div>
    </div>
  );
}
