"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AppNavigationItem } from "./navigation";
import styles from "./AppShell.module.css";

type AppSidebarProps = {
  collapsed: boolean;
  open: boolean;
  items: AppNavigationItem[];
  pathname: string;
  profileImageUrl: string;
  profileInitial: string;
  profileName: string;
  profileLabel: string;
  onToggleCollapsed: () => void;
  onNavigate: (href: string) => void;
  onLogout: () => void;
};

type ModuleKey = "personnel" | "budget" | "students" | "documents";

type SidebarTask = {
  assigneeId?: string | null;
  status?: string;
  assignmentOpenedAt?: string;
};

type SidebarBook = {
  status?: string;
  tasks?: SidebarTask[];
};

type SidebarDocumentsResponse = {
  ok?: boolean;
  books?: SidebarBook[];
};

type SidebarOrderCountResponse = {
  ok?: boolean;
  count?: number;
};

type SidebarTrainingReportTask = {
  status?: string;
};

type SidebarTrainingReportTasksResponse = {
  ok?: boolean;
  tasks?: SidebarTrainingReportTask[];
};

const MODULES: Array<{
  key: ModuleKey;
  label: string;
  icon: string;
  toneClass: string;
}> = [
  {
    key: "personnel",
    label: "งานบุคลากร",
    icon: "♙",
    toneClass: styles.modulePersonnel,
  },
  {
    key: "budget",
    label: "งานงบประมาณ",
    icon: "฿",
    toneClass: styles.moduleBudget,
  },  {
    key: "students",
    label: "งานนักเรียน",
    icon: "▥",
    toneClass: styles.moduleDocuments,
  },

  {
    key: "documents",
    label: "งานหนังสือราชการ",
    icon: "▤",
    toneClass: styles.moduleDocuments,
  },
];

export default function AppSidebar({
  collapsed,
  open,
  items,
  pathname,
  profileImageUrl,
  profileInitial,
  profileName,
  profileLabel,
  onToggleCollapsed,
  onNavigate,
  onLogout,
}: AppSidebarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [newDocumentCount, setNewDocumentCount] = useState(0);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const [pendingTrainingReportCount, setPendingTrainingReportCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const loadNewDocumentCount = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setNewDocumentCount(0);
      return;
    }

    try {
      const response = await fetch("/api/documents", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });
      const result = (await response.json()) as SidebarDocumentsResponse;

      if (!response.ok || !result.ok) return;

      const currentUserId = session.user.id;
      const count = (result.books ?? []).filter(
        (book) =>
          book.status !== "done" &&
          (book.tasks ?? []).some(
            (task) =>
              task.assigneeId === currentUserId &&
              task.status === "assigned" &&
              !task.assignmentOpenedAt,
          ),
      ).length;

      setNewDocumentCount(count);
    } catch {
      // Keep the previous badge value when the request is temporarily unavailable.
    }
  }, [supabase]);

  const loadPendingOrderCount = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setPendingOrderCount(0);
      return;
    }

    try {
      const response = await fetch("/api/orders/pending-acknowledgements", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });
      const result = (await response.json()) as SidebarOrderCountResponse;

      if (!response.ok || !result.ok) return;

      setPendingOrderCount(Number(result.count || 0));
    } catch {
      // Keep the previous badge value when the request is temporarily unavailable.
    }
  }, [supabase]);

  const loadPendingTrainingReportCount = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setPendingTrainingReportCount(0);
      return;
    }

    try {
      const response = await fetch("/api/training-reports/source-tasks?scope=mine", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });
      const result = (await response.json()) as SidebarTrainingReportTasksResponse;

      if (!response.ok || !result.ok) return;

      setPendingTrainingReportCount(
        (result.tasks ?? []).filter((task) => task.status !== "done").length,
      );
    } catch {
      // Keep the previous badge value when the request is temporarily unavailable.
    }
  }, [supabase]);

  const activeModule = useMemo<ModuleKey | null>(() => {
    const activeItem = items.find((item) => item.match(pathname));
    if (
      activeItem?.section === "personnel" ||
      activeItem?.section === "budget" ||
      activeItem?.section === "students" ||
      activeItem?.section === "documents"
    ) {
      return activeItem.section;
    }
    return null;
  }, [items, pathname]);

  const [expandedModule, setExpandedModule] = useState<ModuleKey | null>(
    activeModule ?? "personnel",
  );

  const showProfileImage = profileImageUrl && !imageFailed;
  const homeItems = items.filter((item) => item.section === "home");
  const reviewItems = items.filter((item) => item.section === "review");
  const accountItems = items.filter((item) => item.section === "account");

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setImageFailed(false);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [profileImageUrl]);

  useEffect(() => {
    if (!activeModule) return;

    const timerId = window.setTimeout(() => {
      setExpandedModule(activeModule);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [activeModule]);

  useEffect(() => {
    void loadNewDocumentCount();
    void loadPendingOrderCount();
    void loadPendingTrainingReportCount();

    const handleUpdate = () => {
      void loadNewDocumentCount();
      void loadPendingOrderCount();
      void loadPendingTrainingReportCount();
    };

    window.addEventListener("smart-area-documents-updated", handleUpdate);
    window.addEventListener("order-acknowledgements-updated", handleUpdate);
    window.addEventListener("training-reports-updated", handleUpdate);
    window.addEventListener("focus", handleUpdate);

    return () => {
      window.removeEventListener("smart-area-documents-updated", handleUpdate);
      window.removeEventListener("order-acknowledgements-updated", handleUpdate);
      window.removeEventListener("training-reports-updated", handleUpdate);
      window.removeEventListener("focus", handleUpdate);
    };
  }, [
    loadNewDocumentCount,
    loadPendingOrderCount,
    loadPendingTrainingReportCount,
    pathname,
  ]);

  function toggleModule(key: ModuleKey) {
    setExpandedModule((current) => (current === key ? null : key));
  }

  return (
    <aside
      className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""} ${
        collapsed ? styles.sidebarCollapsed : ""
      }`}
    >
      <div className={styles.sidebarBrand}>
        <button
          type="button"
          className={styles.collapseButton}
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "ขยายเมนู" : "ย่อเมนู"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <div className={styles.userCard}>
        <div className={styles.avatar}>
          {showProfileImage ? (
            <img
              src={profileImageUrl}
              alt="รูปโปรไฟล์"
              onError={() => setImageFailed(true)}
            />
          ) : (
            profileInitial
          )}
        </div>

        {!collapsed && (
          <div className={styles.userInfo}>
            <strong>{profileName}</strong>
            <small>{profileLabel}</small>
            <span>● ออนไลน์</span>
          </div>
        )}
      </div>

      <div className={styles.sidebarScrollArea}>
        <nav className={styles.menuList} aria-label="เมนูหลัก">
          <MenuItems
            collapsed={collapsed}
            items={homeItems}
            pathname={pathname}
            onNavigate={onNavigate}
          />

          <div className={styles.moduleList}>
            {MODULES.map((module) => {
              const moduleItems = items.filter(
                (item) => item.section === module.key,
              );
              const expanded = expandedModule === module.key;
              const active = activeModule === module.key;

              return (
                <ModuleGroup
                  key={module.key}
                  collapsed={collapsed}
                  label={module.label}
                  icon={module.icon}
                  toneClass={module.toneClass}
                  expanded={expanded}
                  active={active}
                  items={moduleItems}
                  pathname={pathname}
                  onToggle={() => toggleModule(module.key)}
                  onNavigate={onNavigate}
                  newDocumentCount={newDocumentCount}
                  pendingOrderCount={pendingOrderCount}
                  pendingTrainingReportCount={pendingTrainingReportCount}
                />
              );
            })}
          </div>

          {reviewItems.length > 0 && (
            <MenuGroup
              collapsed={collapsed}
              title="ส่วนพิจารณา"
              items={reviewItems}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          )}
        </nav>

        <nav className={styles.accountMenuList} aria-label="บัญชีและระบบ">
          <MenuGroup
            collapsed={collapsed}
            title="บัญชีและระบบ"
            items={accountItems}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        </nav>
      </div>

      <button
        type="button"
        className={styles.logoutButton}
        onClick={onLogout}
      >
        <span>⇥</span>
        {!collapsed && <b>ออกจากระบบ</b>}
      </button>
    </aside>
  );
}

function ModuleGroup({
  collapsed,
  label,
  icon,
  toneClass,
  expanded,
  active,
  items,
  pathname,
  onToggle,
  onNavigate,
  newDocumentCount,
  pendingOrderCount,
  pendingTrainingReportCount,
}: {
  collapsed: boolean;
  label: string;
  icon: string;
  toneClass: string;
  expanded: boolean;
  active: boolean;
  items: AppNavigationItem[];
  pathname: string;
  onToggle: () => void;
  onNavigate: (href: string) => void;
  newDocumentCount: number;
  pendingOrderCount: number;
  pendingTrainingReportCount: number;
}) {
  if (items.length === 0) return null;

  return (
    <section
      className={`${styles.moduleGroup} ${toneClass} ${
        active ? styles.moduleGroupActive : ""
      }`}
    >
      <button
        type="button"
        className={styles.moduleButton}
        onClick={onToggle}
        aria-expanded={expanded}
        title={collapsed ? label : undefined}
      >
        <span className={styles.moduleIcon}>{icon}</span>
        {!collapsed && (
          <>
            <b>{label}</b>
            <span
              className={`${styles.moduleChevron} ${
                expanded ? styles.moduleChevronExpanded : ""
              }`}
              aria-hidden="true"
            >
              ▾
            </span>
          </>
        )}
      </button>

      {!collapsed && expanded && (
        <div className={styles.moduleChildren}>
          <MenuItems
            collapsed={false}
            items={items}
            pathname={pathname}
            onNavigate={onNavigate}
            nested
            newDocumentCount={newDocumentCount}
            pendingOrderCount={pendingOrderCount}
            pendingTrainingReportCount={pendingTrainingReportCount}
          />
        </div>
      )}
    </section>
  );
}

function MenuGroup({
  collapsed,
  title,
  items,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  title?: string;
  items: AppNavigationItem[];
  pathname: string;
  onNavigate: (href: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className={styles.menuGroup}>
      {!collapsed && title && <h2 className={styles.menuTitle}>{title}</h2>}
      <MenuItems
        collapsed={collapsed}
        items={items}
        pathname={pathname}
        onNavigate={onNavigate}
      />
    </div>
  );
}

function MenuItems({
  collapsed,
  items,
  pathname,
  onNavigate,
  nested = false,
  newDocumentCount = 0,
  pendingOrderCount = 0,
  pendingTrainingReportCount = 0,
}: {
  collapsed: boolean;
  items: AppNavigationItem[];
  pathname: string;
  onNavigate: (href: string) => void;
  nested?: boolean;
  newDocumentCount?: number;
  pendingOrderCount?: number;
  pendingTrainingReportCount?: number;
}) {
  if (items.length === 0) return null;

  return (
    <>
      {items.map((item) => {
        const active = item.match(pathname);

        return (
          <button
            type="button"
            key={item.label}
            className={`${styles.menuItem} ${
              nested ? styles.menuItemNested : ""
            } ${active ? styles.menuItemActive : ""}`}
            onClick={() => {
              if (!item.disabled) onNavigate(item.href);
            }}
            title={collapsed ? item.label : undefined}
            disabled={item.disabled}
            aria-disabled={item.disabled || undefined}
            style={
              item.disabled
                ? {
                    color: "#9ca3af",
                    background: "transparent",
                    opacity: 0.72,
                    cursor: "not-allowed",
                    boxShadow: "none",
                  }
                : undefined
            }
          >
            <span
              className={styles.menuIcon}
              style={item.disabled ? { opacity: 0.7 } : undefined}
            >
              {item.icon}
            </span>
            {!collapsed && <b>{item.label}</b>}
            {item.href === "/documents" && newDocumentCount > 0 && (
              <span
                aria-label={`งานใหม่ ${newDocumentCount} งาน`}
                style={{
                  display: "inline-grid",
                  minWidth: 20,
                  height: 20,
                  marginLeft: "auto",
                  placeItems: "center",
                  borderRadius: 999,
                  padding: "0 6px",
                  background: "#dc2626",
                  color: "#ffffff",
                  fontSize: 11,
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                {newDocumentCount > 99 ? "99+" : newDocumentCount}
              </span>
            )}
            {item.href === "/orders" && pendingOrderCount > 0 && (
              <span
                aria-label={`คำสั่งที่ต้องรับทราบ ${pendingOrderCount} เรื่อง`}
                style={{
                  display: "inline-grid",
                  minWidth: 20,
                  height: 20,
                  marginLeft: "auto",
                  placeItems: "center",
                  borderRadius: 999,
                  padding: "0 6px",
                  background: "#f59e0b",
                  color: "#ffffff",
                  fontSize: 11,
                  fontWeight: 900,
                  lineHeight: 1,
                }}
              >
                {pendingOrderCount > 99 ? "99+" : pendingOrderCount}
              </span>
            )}
            {item.href === "/documents/training-reports" &&
              pendingTrainingReportCount > 0 && (
                <span
                  aria-label={`งานรายงานผลที่ต้องส่ง ${pendingTrainingReportCount} รายการ`}
                  style={{
                    display: "inline-grid",
                    minWidth: 20,
                    height: 20,
                    marginLeft: "auto",
                    placeItems: "center",
                    borderRadius: 999,
                    padding: "0 6px",
                    background: "#dc2626",
                    color: "#ffffff",
                    fontSize: 11,
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  {pendingTrainingReportCount > 99
                    ? "99+"
                    : pendingTrainingReportCount}
                </span>
              )}
          </button>
        );
      })}
    </>
  );
}
