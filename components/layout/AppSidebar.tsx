"use client";

import { useEffect, useState } from "react";
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
  const showProfileImage = profileImageUrl && !imageFailed;
  const mainItems = items.filter((item) => item.section === "main");
  const reviewItems = items.filter((item) => item.section === "review");
  const accountItems = items.filter((item) => item.section === "account");

  useEffect(() => {
    setImageFailed(false);
  }, [profileImageUrl]);

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
          {collapsed ? "»" : "«"}
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

      <nav className={styles.menuList} aria-label="เมนูหลัก">
        <MenuGroup
          collapsed={collapsed}
          title="ส่วนกรอกข้อมูล"
          items={mainItems}
          pathname={pathname}
          onNavigate={onNavigate}
        />
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

function MenuGroup({
  collapsed,
  title,
  items,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  title: string;
  items: AppNavigationItem[];
  pathname: string;
  onNavigate: (href: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className={styles.menuGroup}>
      {!collapsed && <h2 className={styles.menuTitle}>{title}</h2>}
      {items.map((item) => {
        const active = item.match(pathname);

        return (
          <button
            type="button"
            key={item.label}
            className={`${styles.menuItem} ${
              active ? styles.menuItemActive : ""
            }`}
            onClick={() => onNavigate(item.href)}
            title={collapsed ? item.label : undefined}
          >
            <span className={styles.menuIcon}>{item.icon}</span>
            {!collapsed && <b>{item.label}</b>}
          </button>
        );
      })}
    </div>
  );
}
