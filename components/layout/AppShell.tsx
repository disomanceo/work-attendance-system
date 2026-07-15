"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCachedProfileImageUrl } from "@/lib/profile-image-cache";
import { createClient } from "@/lib/supabase/client";
import AppSidebar from "./AppSidebar";
import { getAppNavigationItems } from "./navigation";
import styles from "./AppShell.module.css";

type Profile = {
  id: string;
  full_name: string;
  position: string | null;
  role: string;
  account_status: string;
  profile_image_file_id: string | null;
  signature_file_id: string | null;
  work_permissions: string[];
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
          "id, full_name, position, role, account_status, profile_image_file_id, signature_file_id, work_permissions"
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
    let cancelled = false;

    async function loadProfileImage() {
      const fileId = profile?.profile_image_file_id;

      if (!fileId) {
        setProfileImageUrl("");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      try {
        const imageUrl = await getCachedProfileImageUrl(
          fileId,
          session?.access_token
        );

        if (cancelled) return;
        setProfileImageUrl(imageUrl);
      } catch {
        if (!cancelled) setProfileImageUrl("");
      }
    }

    void loadProfileImage();

    return () => {
      cancelled = true;
    };
  }, [profile?.profile_image_file_id, supabase]);

  const role = profile?.role ?? "";
  const menuItems = getAppNavigationItems(role);
  const profileName = profile?.full_name || "กำลังโหลด...";
  const profileLabel = profile?.position || getRoleLabel(role);
  const profileInitial = profile?.full_name?.trim().charAt(0) || "U";

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

      <AppSidebar
        collapsed={sidebarCollapsed}
        open={sidebarOpen}
        items={menuItems}
        pathname={pathname}
        profileImageUrl={profileImageUrl}
        profileInitial={profileInitial}
        profileName={profileName}
        profileLabel={profileLabel}
        profileRole={role}
        onToggleCollapsed={toggleCollapsed}
        onNavigate={(href) => router.push(href)}
        onLogout={() => void logout()}
      />

      <div className={styles.content}>{children}</div>
    </div>
  );
}
