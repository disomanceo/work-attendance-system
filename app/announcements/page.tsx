"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./announcements.module.css";

type Profile = {
  id: string;
  full_name: string;
  position: string | null;
  role: string;
};

type AnnouncementItem = {
  id: string;
  announcement_number: string | null;
  subject: string;
  announcement_date: string;
  buddhist_year: number | null;
  responsible_user_id: string;
  responsible_name_snapshot: string;
  status: "DRAFT" | "PENDING" | "REVISION" | "APPROVED" | "CANCELLED";
  revision_count: number;
  latest_revision_note: string | null;
  docx_file_id: string | null;
  docx_file_url: string | null;
  docx_file_name: string | null;
  pdf_file_id: string | null;
  pdf_file_url: string | null;
  pdf_file_name: string | null;
  submitted_at: string | null;
  last_file_uploaded_at: string | null;
  approved_at: string | null;
  updated_at: string;
};

type FormState = {
  id: string;
  subject: string;
  announcementDate: string;
  responsibleUserId: string;
  status: AnnouncementItem["status"] | "";
  revisionCount: number;
};

const EMPTY_FORM: FormState = {
  id: "",
  subject: "",
  announcementDate: new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
  }).format(new Date()),
  responsibleUserId: "",
  status: "",
  revisionCount: 0,
};

const ANNOUNCEMENTS_PER_PAGE = 20;

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function formatThaiDateTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: AnnouncementItem["status"]) {
  const labels = {
    DRAFT: "ฉบับร่าง",
    PENDING: "รออนุมัติ",
    REVISION: "ให้แก้ไข",
    APPROVED: "อนุมัติแล้ว",
    CANCELLED: "ยกเลิก",
  };

  return labels[status];
}

function statusClass(status: AnnouncementItem["status"]) {
  if (status === "PENDING") return styles.statusPending;
  if (status === "REVISION") return styles.statusRevision;
  if (status === "APPROVED") return styles.statusApproved;
  return styles.statusDraft;
}

function extractGoogleDriveFileId(url: string | null) {
  if (!url) return "";

  const pathMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch?.[1]) return pathMatch[1];

  try {
    return new URL(url).searchParams.get("id") ?? "";
  } catch {
    return "";
  }
}

function getWordDownloadUrl(announcement: AnnouncementItem) {
  const fileId =
    announcement.docx_file_id || extractGoogleDriveFileId(announcement.docx_file_url);

  if (!fileId) return announcement.docx_file_url ?? "#";

  return `/api/announcements/files/${encodeURIComponent(fileId)}/download`;
}

export default function AnnouncementsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [canManageAll, setCanManageAll] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [year, setYear] = useState("");
  const [configuredYear, setConfiguredYear] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [sort, setSort] = useState("number_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [docx, setDocx] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [reviewAnnouncement, setReviewAnnouncement] = useState<AnnouncementItem | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.replace("/login");
      throw new Error("กรุณาเข้าสู่ระบบใหม่");
    }

    return session.access_token;
  }, [router, supabase]);

  const loadProfiles = useCallback(async () => {
    const token = await getToken();
    const response = await fetch("/api/announcements/profiles", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "โหลดรายชื่อบุคลากรไม่สำเร็จ");
    }

    setProfiles(result.profiles ?? []);
    setCurrentProfile(result.currentProfile ?? null);
  }, [getToken]);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);

    try {
      const token = await getToken();
      const params = new URLSearchParams();

      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);
      if (year) params.set("year", year);
      if (responsibleId) params.set("responsibleId", responsibleId);

      params.set("sort", sort);
      const response = await fetch(`/api/announcements?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "โหลดทะเบียนประกาศไม่สำเร็จ");
      }

      setAnnouncements(result.announcements ?? []);
      const nextConfiguredYear = String(result.configuredYear ?? "");
      setConfiguredYear(nextConfiguredYear);
      if (!year && nextConfiguredYear) setYear(nextConfiguredYear);
      setCanManageAll(Boolean(result.canManageAll));
      setCurrentProfile(result.currentProfile ?? null);
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ",
        true
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, responsibleId, search, sort, status, year]);

  useEffect(() => {
    void Promise.all([loadProfiles(), loadAnnouncements()]);
  }, [loadAnnouncements, loadProfiles]);

  function showMessage(text: string, isError = false) {
    setMessage(text);
    setMessageError(isError);
    window.setTimeout(() => setMessage(""), 3500);
  }

  function openCreate() {
    setForm({
      ...EMPTY_FORM,
      responsibleUserId: currentProfile?.id ?? "",
    });
    setDocx(null);
    setPdf(null);
    setFormOpen(true);
  }

  function openEdit(announcement: AnnouncementItem) {
    setForm({
      id: announcement.id,
      subject: announcement.subject,
      announcementDate: announcement.announcement_date,
      responsibleUserId: announcement.responsible_user_id,
      status: announcement.status,
      revisionCount: announcement.revision_count,
    });
    setDocx(null);
    setPdf(null);
    setFormOpen(true);
  }

  function canEdit(announcement: AnnouncementItem) {
    if (canManageAll) {
      return ["PENDING", "REVISION"].includes(announcement.status);
    }

    return (
      announcement.responsible_user_id === currentProfile?.id &&
      ["PENDING", "REVISION"].includes(announcement.status)
    );
  }

  function canDelete(announcement: AnnouncementItem) {
    if (canManageAll) return true;

    return (
      announcement.responsible_user_id === currentProfile?.id &&
      ["DRAFT", "REVISION"].includes(announcement.status)
    );
  }

  async function saveAnnouncement(event: FormEvent, action: "submit" | "update") {
    event.preventDefault();
    setSaving(true);

    try {
      const token = await getToken();
      const data = new FormData();

      if (form.id) data.set("id", form.id);
      data.set("action", action);
      data.set("subject", form.subject);
      data.set("announcementDate", form.announcementDate);
      data.set("responsibleUserId", form.responsibleUserId);
      if (docx) data.set("docx", docx);
      if (pdf) data.set("pdf", pdf);

      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "บันทึกรายการไม่สำเร็จ");
      }

      showMessage(result.message || "บันทึกรายการเรียบร้อยแล้ว");
      setFormOpen(false);
      await loadAnnouncements();
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "บันทึกรายการไม่สำเร็จ",
        true
      );
    } finally {
      setSaving(false);
    }
  }

  async function review(action: "approve" | "return") {
    if (!reviewAnnouncement) return;
    setSaving(true);

    try {
      const token = await getToken();
      const response = await fetch(
        `/api/announcements/${reviewAnnouncement.id}/review`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            note: reviewNote,
          }),
        }
      );
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "พิจารณารายการไม่สำเร็จ");
      }

      const savedAnnouncement = result.announcement as AnnouncementItem;

      setAnnouncements((current) =>
        current.flatMap((item) => {
          if (item.id !== savedAnnouncement.id) return [item];

          const updatedItem: AnnouncementItem = {
            ...item,
            ...savedAnnouncement,
          };

          if (status !== "all" && updatedItem.status !== status) {
            return [];
          }

          return [updatedItem];
        })
      );

      showMessage(result.message || "บันทึกผลเรียบร้อยแล้ว");
      setReviewAnnouncement(null);
      setReviewNote("");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "พิจารณารายการไม่สำเร็จ",
        true
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnouncement(announcement: AnnouncementItem) {
    const confirmed = window.confirm(
      `ยืนยันลบประกาศ ${announcement.announcement_number || "รายการนี้"} ใช่หรือไม่?\n\nระบบจะลบทะเบียน ประวัติ และไฟล์ DOCX/PDF ของรายการนี้ แต่ลำดับประกาศเดิมจะไม่ถูกนำกลับมาใช้ซ้ำ`
    );

    if (!confirmed) return;

    setDeletingId(announcement.id);

    try {
      const token = await getToken();
      const response = await fetch("/api/announcements", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ announcementId: announcement.id }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ลบประกาศไม่สำเร็จ");
      }

      showMessage(result.message || "ลบประกาศเรียบร้อยแล้ว");
      await loadAnnouncements();
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "ลบประกาศไม่สำเร็จ",
        true
      );
    } finally {
      setDeletingId("");
    }
  }

  const totalPages = Math.max(
    1,
    Math.ceil(announcements.length / ANNOUNCEMENTS_PER_PAGE)
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedAnnouncements = announcements.slice(
    (safeCurrentPage - 1) * ANNOUNCEMENTS_PER_PAGE,
    safeCurrentPage * ANNOUNCEMENTS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, status, year, responsibleId, sort]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);
  function renderFiles(announcement: AnnouncementItem) {
    return (
      <div className={styles.files}>
        {announcement.docx_file_url && (
          <a
            className={`${styles.fileButton} ${styles.wordFileButton}`}
            href={getWordDownloadUrl(announcement)}
            download={announcement.docx_file_name || undefined}
            rel="noreferrer"
            title="ดาวน์โหลดไฟล์ Word"
            aria-label="ดาวน์โหลดไฟล์ Word"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
            >
              <path
                fill="currentColor"
                d="M4 3h10l6 6v12H4V3Zm9 1.8V10h5.2L13 4.8ZM7 13l1.2 5h1.7l1-3.3L12 18h1.7l1.3-5h-1.6l-.7 3.2-1-3.2h-1.5l-1 3.2-.7-3.2H7Z"
              />
            </svg>
            <span>Word</span>
          </a>
        )}

        {announcement.pdf_file_url && (
          <a
            className={`${styles.fileButton} ${styles.pdfFileButton}`}
            href={announcement.pdf_file_url}
            target="_blank"
            rel="noreferrer"
            title="เปิดไฟล์ PDF"
            aria-label="เปิดไฟล์ PDF"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
            >
              <path
                fill="currentColor"
                d="M4 3h10l6 6v12H4V3Zm9 1.8V10h5.2L13 4.8ZM7 13v5h1.5v-1.5h.8c1.5 0 2.5-.7 2.5-1.8 0-1.2-.9-1.7-2.5-1.7H7Zm1.5 1.2h.7c.7 0 1 .2 1 .6 0 .4-.3.6-1 .6h-.7v-1.2Zm4.1-1.2v5h2.1c1.8 0 2.9-.9 2.9-2.5S16.5 13 14.7 13h-2.1Zm1.5 1.2h.5c.9 0 1.4.4 1.4 1.3 0 .9-.5 1.3-1.4 1.3h-.5v-2.6Z"
              />
            </svg>
            <span>PDF</span>
          </a>
        )}

        {!announcement.docx_file_url && !announcement.pdf_file_url && (
          <span className={styles.noFile}>รอแนบไฟล์</span>
        )}
      </div>
    );
  }

  function renderActions(announcement: AnnouncementItem) {
    return (
      <div className={styles.actions}>
        {canManageAll && announcement.status === "PENDING" && (
          <button
            type="button"
            className={styles.reviewButton}
            onClick={() => {
              setReviewAnnouncement(announcement);
              setReviewNote("");
            }}
          >
            พิจารณา
          </button>
        )}

        {canEdit(announcement) && (
          <button
            type="button"
            className={`${styles.updateButton} ${
              announcement.status === "REVISION" ? styles.hasBadge : ""
            }`}
            onClick={() => openEdit(announcement)}
          >
            อัปเดต
            {announcement.status === "REVISION" && (
              <span className={styles.badge}>{announcement.revision_count}</span>
            )}
          </button>
        )}

        {canDelete(announcement) && (
          <button
            type="button"
            className={styles.deleteButton}
            title="ลบประกาศ"
            aria-label="ลบประกาศ"
            disabled={deletingId === announcement.id}
            onClick={() => void deleteAnnouncement(announcement)}
          >
            {deletingId === announcement.id ? "…" : "×"}
          </button>
        )}
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        {message && (
          <div
            className={`${styles.notice} ${
              messageError ? styles.noticeError : ""
            }`}
          >
            {message}
          </div>
        )}

        <header className={styles.header}>
          <div>
            <small>ANNOUNCEMENT REGISTRY</small>
            <h1>ทะเบียนประกาศ</h1>
            <p>เก็บลำดับที่ เรื่อง ผู้รับผิดชอบ และไฟล์ประกาศ</p>
          </div>
          <button type="button" className={styles.primary} onClick={openCreate}>
            + เพิ่มประกาศ
          </button>
        </header>

        <section className={styles.toolbar}>
          <input
            value={search}
            placeholder="ค้นหาลำดับที่ประกาศ หรือชื่อเรื่อง"
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={year} onChange={(event) => setYear(event.target.value)}>
            <option value="">ทุกปี</option>
            {configuredYear && (
              <option value={configuredYear}>พ.ศ. {configuredYear}</option>
            )}
          </select>
          <select
            value={responsibleId}
            onChange={(event) => setResponsibleId(event.target.value)}
          >
            <option value="">ผู้รับผิดชอบทั้งหมด</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">ทุกสถานะ</option>
            <option value="PENDING">รออนุมัติ</option>
            <option value="REVISION">ให้แก้ไข</option>
            <option value="APPROVED">อนุมัติแล้ว</option>
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="number_desc">ลำดับล่าสุด → เก่าสุด</option>
            <option value="number_asc">ลำดับเก่าสุด → ล่าสุด</option>
            <option value="date_desc">วันที่ล่าสุด → เก่าสุด</option>
            <option value="date_asc">วันที่เก่าสุด → ล่าสุด</option>
            <option value="updated_desc">อัปเดตล่าสุด</option>
            <option value="subject_asc">ชื่อเรื่อง ก → ฮ</option>
          </select>
        </section>

        <section className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.numberColumn}>ลำดับที่</th>
                <th className={styles.subjectColumn}>เรื่อง</th>
                <th className={styles.dateColumn}>วันที่</th>
                <th className={styles.ownerColumn}>ผู้รับผิดชอบ</th>
                <th className={styles.fileColumn}>ไฟล์</th>
                <th className={styles.statusColumn}>สถานะ</th>
                <th className={styles.actionColumn}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                pagedAnnouncements.map((announcement) => (
                  <tr key={announcement.id}>
                    <td>{announcement.announcement_number || "ร่าง"}</td>
                    <td>
                      <div className={styles.subject}>{announcement.subject}</div>
                      <span className={styles.meta}>
                        อัปเดต {formatThaiDateTime(announcement.updated_at)}
                      </span>
                      {announcement.status === "REVISION" &&
                        announcement.latest_revision_note && (
                          <div className={styles.revisionNote}>
                            {announcement.latest_revision_note}
                          </div>
                        )}
                    </td>
                    <td>{formatThaiDate(announcement.announcement_date)}</td>
                    <td>{announcement.responsible_name_snapshot}</td>
                    <td>{renderFiles(announcement)}</td>
                    <td>
                      <span
                        className={`${styles.status} ${statusClass(
                          announcement.status
                        )}`}
                      >
                        {statusLabel(announcement.status)}
                      </span>
                    </td>
                    <td>{renderActions(announcement)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!loading && announcements.length === 0 && (
            <div className={styles.empty}>ยังไม่มีรายการประกาศ</div>
          )}
          {loading && <div className={styles.empty}>กำลังโหลด...</div>}
        </section>

        <section className={styles.mobileCards}>
          {pagedAnnouncements.map((announcement) => (
            <article className={styles.mobileCard} key={announcement.id}>
              <div className={styles.mobileTop}>
                <strong>{announcement.announcement_number || "ฉบับร่าง"}</strong>
                <span
                  className={`${styles.status} ${statusClass(announcement.status)}`}
                >
                  {statusLabel(announcement.status)}
                </span>
              </div>
              <div className={styles.mobileSubject}>{announcement.subject}</div>
              <div className={styles.mobileMeta}>
                {formatThaiDate(announcement.announcement_date)} ·{" "}
                {announcement.responsible_name_snapshot}
                <br />
                อัปเดตล่าสุด {formatThaiDateTime(announcement.updated_at)}
              </div>
              {announcement.status === "REVISION" &&
                announcement.latest_revision_note && (
                  <div className={styles.revisionNote}>
                    {announcement.latest_revision_note}
                  </div>
                )}
              <div className={styles.actions}>
                {renderFiles(announcement)}
                {renderActions(announcement)}
              </div>
            </article>
          ))}
        </section>

        {announcements.length > ANNOUNCEMENTS_PER_PAGE && (
          <nav className={styles.pagination} aria-label="หน้ารายการประกาศ">
            <span>
              แสดง{" "}
              {(safeCurrentPage - 1) * ANNOUNCEMENTS_PER_PAGE + 1}-
              {Math.min(safeCurrentPage * ANNOUNCEMENTS_PER_PAGE, announcements.length)}{" "}
              จาก {announcements.length} รายการ
            </span>

            <div>
              <button
                type="button"
                disabled={safeCurrentPage === 1}
                onClick={() =>
                  setCurrentPage((page) => Math.max(1, page - 1))
                }
              >
                ก่อนหน้า
              </button>

              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .filter(
                  (page) =>
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - safeCurrentPage) <= 1
                )
                .map((page, index, visiblePages) => (
                  <span className={styles.pageNumberWrap} key={page}>
                    {index > 0 &&
                      page - visiblePages[index - 1] > 1 && (
                        <i>…</i>
                      )}
                    <button
                      type="button"
                      className={
                        page === safeCurrentPage
                          ? styles.activePage
                          : undefined
                      }
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  </span>
                ))}

              <button
                type="button"
                disabled={safeCurrentPage === totalPages}
                onClick={() =>
                  setCurrentPage((page) =>
                    Math.min(totalPages, page + 1)
                  )
                }
              >
                ถัดไป
              </button>
            </div>
          </nav>
        )}
      </div>

      {formOpen && (
        <div className={styles.overlay}>
          <section className={styles.modal}>
            <h2>
              {form.id
                ? form.status === "REVISION"
                  ? `อัปเดตประกาศ ครั้งที่ ${form.revisionCount}`
                  : "อัปเดตประกาศ"
                : "เพิ่มประกาศ"}
            </h2>

            <form
              className={styles.form}
              onSubmit={(event) =>
                void saveAnnouncement(
                  event,
                  form.status === "REVISION" ? "update" : "submit"
                )
              }
            >
              <label>
                <span>เรื่องประกาศ</span>
                <textarea
                  rows={3}
                  required
                  value={form.subject}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                />
              </label>

              <div className={styles.formGrid}>
                <label>
                  <span>วันที่ประกาศ</span>
                  <input
                    type="date"
                    required
                    value={form.announcementDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        announcementDate: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  <span>ผู้รับผิดชอบ</span>
                  <select
                    required
                    disabled={!canManageAll}
                    value={form.responsibleUserId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        responsibleUserId: event.target.value,
                      }))
                    }
                  >
                    <option value="">เลือกผู้รับผิดชอบ</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={styles.formGrid}>
                <label>
                  <span>ไฟล์ Word (ไม่บังคับ)</span>
                  <input
                    type="file"
                    accept=".doc,.docx,.docm,.dot,.dotx,.dotm,.rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-word.document.macroEnabled.12,application/vnd.ms-word.template.macroEnabled.12,application/rtf,text/rtf"
                    onChange={(event) =>
                      setDocx(event.target.files?.[0] ?? null)
                    }
                  />
                </label>

                <label>
                  <span>ไฟล์ PDF (ไม่บังคับ)</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(event) =>
                      setPdf(event.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>

              <small>
                สามารถส่งประกาศให้ ผอ. พิจารณาได้โดยแนบไฟล์ภายหลัง และกลับมาอัปเดตไฟล์ได้เมื่อยังไม่อนุมัติ
                {form.id &&
                  " เมื่อเลือกไฟล์ใหม่ ระบบจะแทนที่ไฟล์เดิมและบันทึกเวลาอัปเดต"}
              </small>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={saving}
                >
                  {saving
                    ? "กำลังบันทึก..."
                    : form.id
                    ? "อัปเดต"
                    : docx || pdf
                    ? "ส่ง"
                    : "ส่งให้ ผอ. พิจารณา"}
                  {form.status === "REVISION" && (
                    <span className={styles.badge}>
                      {form.revisionCount}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {reviewAnnouncement && (
        <div className={styles.overlay}>
          <section className={styles.modal}>
            <h2>พิจารณาประกาศ {reviewAnnouncement.announcement_number}</h2>
            <p>{reviewAnnouncement.subject}</p>

            <label className={styles.form}>
              <span>รายละเอียดที่ต้องแก้ไข</span>
              <textarea
                rows={4}
                value={reviewNote}
                placeholder="กรอกเมื่อต้องการส่งกลับแก้ไข"
                onChange={(event) => setReviewNote(event.target.value)}
              />
            </label>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={`${styles.secondary} ${styles.reviewModalButton}`}
                disabled={saving}
                onClick={() => setReviewAnnouncement(null)}
              >
                ปิด
              </button>
              <button
                type="button"
                className={`${styles.returnButton} ${styles.reviewModalButton}`}
                disabled={saving}
                onClick={() => void review("return")}
              >
                ส่งกลับแก้ไข
              </button>
              <button
                type="button"
                className={`${styles.reviewButton} ${styles.reviewModalButton}`}
                disabled={saving}
                onClick={() => void review("approve")}
              >
                {saving ? "กำลังบันทึก..." : "อนุมัติ"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
