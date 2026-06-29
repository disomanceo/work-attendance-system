"use client";

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
          {profileImageUrl ? (
            <img src={profileImageUrl} alt="รูปโปรไฟล์" />
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

      {!collapsed && <h2 className={styles.menuTitle}>เมนูของฉัน</h2>}

      <nav className={styles.menuList} aria-label="เมนูของฉัน">
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
