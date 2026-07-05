"use client";

import { useEffect, useMemo, useState } from "react";
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

type ModuleKey = "personnel" | "budget" | "documents";

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

  const activeModule = useMemo<ModuleKey | null>(() => {
    const activeItem = items.find((item) => item.match(pathname));
    if (
      activeItem?.section === "personnel" ||
      activeItem?.section === "budget" ||
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
}: {
  collapsed: boolean;
  items: AppNavigationItem[];
  pathname: string;
  onNavigate: (href: string) => void;
  nested?: boolean;
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
          </button>
        );
      })}
    </>
  );
}
