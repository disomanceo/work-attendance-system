"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCachedProfileImageUrl } from "@/lib/profile-image-cache";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

type TaskItem = {
  id: string;
  assigneeId: string | null;
  assigneeName: string;
  status: string;
  assignmentOpenedAt: string;
  assignmentAcknowledgedAt: string;
};

type AttachmentItem = {
  id: string;
  fileName: string;
  mimeType: string;
  attachmentType: "original" | "signed";
  openUrl: string;
  hasDriveFile: boolean;
};

type BookItem = {
  id: string;
  legacySmartAreaId: string;
  registrationNumber: string;
  receivedDate: string;
  sourceAgency: string;
  subject: string;
  documentNumber: string;
  documentDate: string;
  documentType: string;
  urgency: string;
  status: string;
  note: string;
  directorNote: string;
  smartAreaPage: number;
  smartAreaOrder: number;
  sourceUrl: string;
  updatedAt: string;
  isRead: boolean;
  tasks: TaskItem[];
  attachments: AttachmentItem[];
};

type Capabilities = {
  canSubmit: boolean;
  canAssign: boolean;
  canClose: boolean;
};

type Assignee = {
  id: string;
  fullName: string;
  position: string;
  role: string;
};

type DocumentsResponse = {
  ok: boolean;
  books?: BookItem[];
  accessMode?: "all" | "assigned";
  canManageAll?: boolean;
  workspaceMode?: WorkspaceMode;
  capabilities?: Capabilities;
  message?: string;
};

type DocumentsVersionResponse = {
  ok: boolean;
  version?: number;
  lastChangeAt?: string | null;
  message?: string;
};

type DocumentsChangesResponse = {
  ok: boolean;
  books?: BookItem[];
  deletedIds?: string[];
  version?: number;
  lastChangeAt?: string | null;
  message?: string;
};

type SingleDocumentResponse = {
  ok: boolean;
  book?: BookItem | null;
  message?: string;
};

type AssigneesResponse = {
  ok: boolean;
  assignees?: Assignee[];
  message?: string;
};

type ProfileSummary = {
  fullName: string;
  position: string;
  profileImageFileId: string;
};

type ExtensionInfo = {
  version: string;
  downloadUrl: string;
};

type SortMode = "newest" | "oldest" | "registration";
type ViewMode = "clerk" | "mine" | "all" | "archive";
type WorkspaceMode = "manager" | "clerk" | "member";

const statusLabels: Record<string, string> = {
  clerk_review: "รอธุรการตรวจ",
  director_review: "รอ ผอ. พิจารณา",
  assigned: "มอบหมายแล้ว",
  in_progress: "กำลังดำเนินการ",
  done: "เสร็จแล้ว",
};

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getStatusLabel(status: string) {
  return statusLabels[status] || status || "-";
}

function registrationValue(value: string) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function bookLatestValue(book: BookItem) {
  const dateValue = Date.parse(
    book.receivedDate || book.documentDate || book.updatedAt || "",
  );

  if (Number.isFinite(dateValue)) return dateValue;

  return Number(book.smartAreaPage || 0) * 100000 + Number(book.smartAreaOrder || 0);
}

function shortThaiName(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "-";

  const withoutTitle = trimmed.replace(
    /^(นาย|นางสาว|นาง|น\.ส\.|ดร\.|ผอ\.|รองผอ\.|ว่าที่ร้อยตรี|ว่าที่ ร\.ต\.)\s*/,
    "",
  );
  return withoutTitle.split(/\s+/)[0] || trimmed;
}

function assigneeFirstNames(tasks: TaskItem[]) {
  const names = tasks
    .map((task) => shortThaiName(task.assigneeName))
    .filter((name) => name && name !== "-");

  return names.length > 0 ? names.join(", ") : "-";
}

function sourceDisplayParts(value: string) {
  const raw = String(value || "").trim();

  if (!raw) {
    return { name: "-", group: "" };
  }

  const bracketValues = [...raw.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);

  const lines = raw
    .split(/\r?\n|\s{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  const name =
    bracketValues.at(-1) ||
    lines.find(
      (line) =>
        !/^(กลุ่ม|ฝ่าย|งาน|สำนักงาน|สพป\.|สพม\.|รายละเอียด|เรื่อง|เลขที่|วันที่)/.test(
          line,
        ),
    ) ||
    lines[0] ||
    raw;

  const group =
    lines.find((line) => /^(กลุ่ม|ฝ่าย|งาน)/.test(line)) ||
    bracketValues.find((line) => /^(กลุ่ม|ฝ่าย|งาน)/.test(line)) ||
    "";

  return { name, group };
}

function displayAttachmentName(fileName: string, index: number) {
  const trimmed = String(fileName || "").trim();

  if (!trimmed || trimmed.length > 42) {
    return `ไฟล์แนบ ${index + 1}`;
  }

  return trimmed;
}
function isMostUrgent(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .includes("ด่วนที่สุด");
}

function MailStateIcon({
  isRead,
  urgency,
}: {
  isRead: boolean;
  urgency: string;
}) {
  const mostUrgent = isMostUrgent(urgency);

  return (
    <span
      className={`${styles.mailStatePill} ${
        mostUrgent ? styles.mailStateCritical : styles.mailStateNormal
      }`}
      title={
        mostUrgent
          ? isRead
            ? "จดหมายด่วนที่สุด อ่านแล้ว"
            : "จดหมายด่วนที่สุด ยังไม่อ่าน"
          : isRead
            ? "อ่านแล้ว"
            : "ยังไม่อ่าน"
      }
      aria-label={
        mostUrgent
          ? isRead
            ? "จดหมายเปิด ด่วนที่สุด อ่านแล้ว"
            : "จดหมายปิด ด่วนที่สุด ยังไม่อ่าน"
          : isRead
            ? "จดหมายเปิด อ่านแล้ว"
            : "จดหมายปิด ยังไม่อ่าน"
      }
    >
      <svg
        className={styles.mailStateSvg}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {isRead ? (
          <>
            <path d="M3.5 9.5 12 4l8.5 5.5v9H3.5v-9Z" />
            <path d="m3.8 10 8.2 5 8.2-5" />
            <path d="M7 7.2V4.8h10v2.4" />
          </>
        ) : (
          <>
            <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
            <path d="m4.3 7 7.7 5.2L19.7 7" />
          </>
        )}
      </svg>
    </span>
  );
}
function orderedAttachments(attachments: AttachmentItem[]) {
  const signed = attachments
    .filter((attachment) => attachment.attachmentType === "signed")
    .slice(0, 1);
  const originals = attachments.filter(
    (attachment) => attachment.attachmentType !== "signed",
  );

  return [...signed, ...originals];
}

function workloadBlockColor(index: number) {
  const colors = [
    "#22c55e",
    "#4ade80",
    "#84cc16",
    "#a3e635",
    "#eab308",
    "#facc15",
    "#f59e0b",
    "#f97316",
    "#ef6a45",
    "#ef4444",
  ];

  return colors[Math.min(index, colors.length - 1)];
}

function assignmentState(book: BookItem, currentUserId: string) {
  const task = book.tasks.find((item) => item.assigneeId === currentUserId);

  if (!task) return "pending";
  if (
    task.assignmentAcknowledgedAt ||
    task.status === "in_progress" ||
    task.status === "done"
  ) {
    return "acknowledged";
  }
  if (task.assignmentOpenedAt) return "read";
  return "pending";
}

function originalAttachmentNumber(
  book: BookItem,
  attachment: AttachmentItem,
) {
  if (attachment.attachmentType === "signed") return null;

  const originalIndex = orderedAttachments(book.attachments)
    .filter((item) => item.attachmentType !== "signed")
    .findIndex((item) => item.id === attachment.id);

  return originalIndex >= 0 ? originalIndex + 1 : null;
}

function attachmentDisplayLabel(
  attachment: AttachmentItem,
  book: BookItem,
  currentUserId: string,
) {
  if (attachment.attachmentType === "signed") {
    const state = assignmentState(book, currentUserId);
    if (state === "acknowledged") return "รับทราบแล้ว";
    if (state === "read") return "อ่านแล้ว";
    return "แจ้งมอบหมาย";
  }

  const number = originalAttachmentNumber(book, attachment) ?? 1;
  return displayAttachmentName(attachment.fileName, number - 1);
}
export default function DocumentsPage() {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [profileSummary, setProfileSummary] = useState<ProfileSummary>({
    fullName: "",
    position: "",
    profileImageFileId: "",
  });
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("member");
  const [accessMode, setAccessMode] = useState<"all" | "assigned">("assigned");
  const [canManageAll, setCanManageAll] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>({
    canSubmit: false,
    canAssign: false,
    canClose: false,
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [editingBook, setEditingBook] = useState<BookItem | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [actionNote, setActionNote] = useState("");
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [workloadCollapsed, setWorkloadCollapsed] = useState(false);
  const [selectedSmartAreaPage, setSelectedSmartAreaPage] = useState<number | null>(null);
  const returnBookHandledRef = useRef(false);
  const keepSelectedBookOnFilterChangeRef = useRef(false);
  const mobileScrollYRef = useRef(0);
  const documentVersionRef = useRef(0);
  const documentChangeAtRef = useRef("");
  const documentCheckRunningRef = useRef(false);
  const hadSelectedBookRef = useRef(false);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [extensionInfo, setExtensionInfo] = useState<ExtensionInfo>({
    version: "1.8.17",
    downloadUrl:
      "https://drive.google.com/file/d/1u-aZKFLaAc5h_zAhh-KKBppLpbyYV-WP/view?usp=drive_link",
  });
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const sessionToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return "";
    }

    setCurrentUserId(session.user.id);
    return session.access_token;
  }, [router, supabase]);

  const loadProfileSummary = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("full_name, position, profile_image_file_id")
      .eq("id", user.id)
      .single();

    if (!data) return;

    const nextProfile = {
      fullName: String(data.full_name || ""),
      position: String(data.position || ""),
      profileImageFileId: String(data.profile_image_file_id || ""),
    };

    setProfileSummary(nextProfile);

    if (!nextProfile.profileImageFileId) {
      setProfileImageUrl("");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    try {
      const imageUrl = await getCachedProfileImageUrl(
        nextProfile.profileImageFileId,
        session?.access_token,
      );
      setProfileImageUrl(imageUrl);
    } catch {
      setProfileImageUrl("");
    }
  }, [supabase]);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const token = await sessionToken();
      if (!token) return;

      const response = await fetch("/api/documents", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as DocumentsResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถโหลดรายการหนังสือราชการได้");
      }

      const loadedBooks = result.books ?? [];
      setBooks(loadedBooks);
      setLastLoadedAt(new Date());

      setAccessMode(result.accessMode ?? "assigned");
      setCanManageAll(result.canManageAll === true);

      const nextWorkspaceMode = result.workspaceMode ?? "member";
      setWorkspaceMode(nextWorkspaceMode);
      setViewMode((current) => {
        if (nextWorkspaceMode === "manager") {
          return current === "archive" ? "archive" : "all";
        }

        if (nextWorkspaceMode === "clerk") {
          return current === "clerk" ||
            current === "mine" ||
            current === "all" ||
            current === "archive"
            ? current
            : "clerk";
        }

        return current === "archive" ? "archive" : "mine";
      });
      setCapabilities(
        result.capabilities ?? {
          canSubmit: false,
          canAssign: false,
          canClose: false,
        },
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  const loadExtensionInfo = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/documents/import-area-pms?action=extensionInfo",
        { cache: "no-store" },
      );
      const result = await response.json();

      if (response.ok && result?.ok) {
        setExtensionInfo({
          version: String(result.version || "1.8.17"),
          downloadUrl: String(
            result.downloadUrl ||
              "https://drive.google.com/file/d/1u-aZKFLaAc5h_zAhh-KKBppLpbyYV-WP/view?usp=drive_link",
          ),
        });
      }
    } catch {
      // Use the built-in fallback.
    }
  }, []);

  const storeDocumentVersion = useCallback(
    async (token: string) => {
      const response = await fetch("/api/documents/version", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const result = (await response.json()) as DocumentsVersionResponse;

      if (!response.ok || !result.ok) return;

      documentVersionRef.current = Number(result.version || 0);
      documentChangeAtRef.current = String(result.lastChangeAt || "");
    },
    [],
  );

  const mergeChangedBooks = useCallback(
    (changedBooks: BookItem[], deletedIds: string[]) => {
      const deleted = new Set(deletedIds);

      setBooks((current) => {
        const next = new Map(
          current
            .filter((book) => !deleted.has(book.id))
            .map((book) => [book.id, book]),
        );

        for (const book of changedBooks) {
          next.set(book.id, book);
        }

        return Array.from(next.values());
      });

      setSelectedBook((current) => {
        if (!current || deleted.has(current.id)) return null;

        return (
          changedBooks.find((book) => book.id === current.id) || current
        );
      });
    },
    [],
  );

  const refreshBook = useCallback(
    async (bookId: string) => {
      const token = await sessionToken();
      if (!token || !bookId) return;

      const response = await fetch(
        `/api/documents/book/${encodeURIComponent(bookId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );

      if (response.status === 404) {
        mergeChangedBooks([], [bookId]);
        return;
      }

      const result = (await response.json()) as SingleDocumentResponse;

      if (!response.ok || !result.ok || !result.book) {
        throw new Error(result.message || "ไม่สามารถอัปเดตหนังสือรายการนี้ได้");
      }

      mergeChangedBooks([result.book], []);
      await storeDocumentVersion(token);
    },
    [mergeChangedBooks, sessionToken, storeDocumentVersion],
  );

  const checkDocumentChanges = useCallback(
    async (force = false) => {
      if (documentCheckRunningRef.current) return;

      documentCheckRunningRef.current = true;

      try {
        const token = await sessionToken();
        if (!token) return;

        const versionResponse = await fetch("/api/documents/version", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const versionResult =
          (await versionResponse.json()) as DocumentsVersionResponse;

        if (!versionResponse.ok || !versionResult.ok) return;

        const nextVersion = Number(versionResult.version || 0);
        const nextChangeAt = String(versionResult.lastChangeAt || "");

        if (!documentChangeAtRef.current) {
          documentVersionRef.current = nextVersion;
          documentChangeAtRef.current = nextChangeAt;
          return;
        }

        if (!force && nextVersion === documentVersionRef.current) {
          return;
        }

        const changesResponse = await fetch(
          `/api/documents/changes?after=${encodeURIComponent(
            documentChangeAtRef.current,
          )}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );

        const changesResult =
          (await changesResponse.json()) as DocumentsChangesResponse;

        if (!changesResponse.ok || !changesResult.ok) return;

        mergeChangedBooks(
          changesResult.books ?? [],
          changesResult.deletedIds ?? [],
        );

        documentVersionRef.current = Number(
          changesResult.version ?? nextVersion,
        );
        documentChangeAtRef.current = String(
          changesResult.lastChangeAt || nextChangeAt,
        );
      } finally {
        documentCheckRunningRef.current = false;
      }
    },
    [mergeChangedBooks, sessionToken],
  );

  const loadAssignees = useCallback(async () => {
    if (!canManageAll) return;

    const token = await sessionToken();
    if (!token) return;

    const response = await fetch("/api/documents/assignees", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = (await response.json()) as AssigneesResponse;

    if (response.ok && result.ok) {
      setAssignees(result.assignees ?? []);
    }
  }, [canManageAll, sessionToken]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    void loadProfileSummary();
  }, [loadProfileSummary]);

  useEffect(() => {
    void loadAssignees();
  }, [loadAssignees]);

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        void checkDocumentChanges();
      }
    };

    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleVisible);

    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleVisible);
    };
  }, [checkDocumentChanges]);

  useEffect(() => {
    if (selectedBook) {
      hadSelectedBookRef.current = true;
      return;
    }

    if (hadSelectedBookRef.current) {
      hadSelectedBookRef.current = false;
      void checkDocumentChanges();
    }
  }, [checkDocumentChanges, selectedBook]);

  async function postAction(payload: Record<string, unknown>, key: string) {
    setSavingKey(key);
    setMessage("");
    setSuccessMessage("");

    try {
      const token = await sessionToken();
      if (!token) return false;

      const response = await fetch("/api/documents/actions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถดำเนินการได้");
      }

      setSuccessMessage("บันทึกการดำเนินการเรียบร้อยแล้ว");
      await refreshBook(String(result.bookId || payload.bookId || ""));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
      return false;
    } finally {
      setSavingKey("");
    }
  }

  async function markAssignmentRead(
    book: BookItem,
    attachment: AttachmentItem,
  ) {
    if (attachment.attachmentType !== "signed") return;

    const ownTask = book.tasks.find(
      (task) => task.assigneeId === currentUserId,
    );

    if (!ownTask || ownTask.assignmentOpenedAt) return;

    const openedAt = new Date().toISOString();

    setBooks((current) =>
      current.map((item) =>
        item.id === book.id
          ? {
              ...item,
              tasks: item.tasks.map((task) =>
                task.id === ownTask.id
                  ? { ...task, assignmentOpenedAt: openedAt }
                  : task,
              ),
            }
          : item,
      ),
    );

    try {
      const accessToken = await sessionToken();
      if (!accessToken) return;

      const response = await fetch("/api/documents/assignment-read", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId: ownTask.id,
          attachmentId: attachment.id,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "ไม่สามารถบันทึกสถานะการอ่านได้");
      }
    } catch (error) {
      console.error("Mark assignment read error:", error);
      await refreshBook(book.id);
    }
  }

  async function markBookRead(book: BookItem) {
    if (book.isRead) return;

    setBooks((current) =>
      current.map((item) =>
        item.id === book.id ? { ...item, isRead: true } : item,
      ),
    );

    try {
      const accessToken = await sessionToken();
      if (!accessToken) return;

      const response = await fetch("/api/documents/read", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bookId: book.id }),
      });

      if (!response.ok) {
        throw new Error("Unable to save read status");
      }
    } catch (error) {
      console.error("Mark book as read error:", error);
      setBooks((current) =>
        current.map((item) =>
          item.id === book.id ? { ...item, isRead: false } : item,
        ),
      );
    }
  }

  function closeMobileDetail() {
    setSelectedBook(null);
    void checkDocumentChanges();

    if (typeof window === "undefined") return;

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: mobileScrollYRef.current,
        behavior: "auto",
      });
    });
  }

  async function updateTaskStatus(taskId: string, status: string) {
    const currentBook = books.find((book) =>
      book.tasks.some((task) => task.id === taskId),
    );
    const previousBooks = books;

    setSavingKey(taskId);
    setMessage("");
    setSuccessMessage("");

    setBooks((current) =>
      current.map((book) => {
        if (book.id !== currentBook?.id) return book;

        const tasks = book.tasks.map((task) =>
          task.id === taskId ? { ...task, status } : task,
        );
        const allDone = tasks.length > 0 && tasks.every((task) => task.status === "done");
        const hasInProgress = tasks.some((task) => task.status === "in_progress");

        return {
          ...book,
          tasks,
          status: allDone ? "done" : hasInProgress ? "in_progress" : book.status,
        };
      }),
    );

    try {
      const token = await sessionToken();
      if (!token) {
        setBooks(previousBooks);
        return;
      }

      const response = await fetch("/api/documents/tasks", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId, status }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถเปลี่ยนสถานะงานได้");
      }

      const updatedBookId = String(result.bookId || currentBook?.id || "");

      if (updatedBookId) {
        await refreshBook(updatedBookId);
      }

      window.dispatchEvent(
        new CustomEvent("smart-area-documents-updated", {
          detail: { bookId: updatedBookId },
        }),
      );
      setSuccessMessage("อัปเดตสถานะงานเรียบร้อยแล้ว");
    } catch (error) {
      setBooks(previousBooks);
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setSavingKey("");
    }
  }

  function closeBookAsDone(book: BookItem) {
    const hasIncompleteAssignments = book.tasks.some(
      (task) => task.status !== "done",
    );
    const confirmed = window.confirm(
      hasIncompleteAssignments
        ? "เรื่องนี้ยังมีผู้รับมอบหมายที่ทำงานไม่เสร็จ ยืนยันปิดเรื่องเป็นเสร็จสิ้นหรือไม่"
        : "ยืนยันปิดเรื่องนี้เป็นเสร็จสิ้นหรือไม่",
    );

    if (!confirmed) return;

    void postAction(
      {
        action: "close",
        bookId: book.id,
        note: "ผอ. ปิดเรื่องเป็นเสร็จสิ้น",
      },
      `close:${book.id}`,
    );
  }

  function openAssignment(book: BookItem) {
    setEditingBook(book);
    setSelectedAssigneeIds(
      book.tasks.map((task) => task.assigneeId).filter(Boolean) as string[],
    );
    setActionNote(book.directorNote || "");
  }

  async function saveAssignment() {
    if (!editingBook) return;

    const ok = await postAction(
      {
        action: "assign",
        bookId: editingBook.id,
        assigneeIds: selectedAssigneeIds,
        note: actionNote,
      },
      `assign:${editingBook.id}`,
    );

    if (ok) setEditingBook(null);
  }

  const summary = useMemo(() => {
    const pendingReview = books.filter(
      (book) =>
        book.status === "clerk_review" || book.status === "director_review",
    ).length;
    const activeWork = books.filter(
      (book) => book.status === "assigned" || book.status === "in_progress",
    ).length;
    const done = books.filter((book) => book.status === "done").length;

    return {
      all: books.length,
      pendingReview,
      activeWork,
      done,
    };
  }, [books]);

  const workload = useMemo(() => {
    const pendingByAssignee = new Map<string, number>();

    books.forEach((book) => {
      book.tasks.forEach((task) => {
        if (!task.assigneeId || task.status === "done") return;
        pendingByAssignee.set(
          task.assigneeId,
          (pendingByAssignee.get(task.assigneeId) || 0) + 1,
        );
      });
    });

    return assignees
      .map((person) => ({
        id: person.id,
        name: shortThaiName(person.fullName),
        fullName: person.fullName,
        count: pendingByAssignee.get(person.id) || 0,
      }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.fullName.localeCompare(right.fullName, "th"),
      );
  }, [assignees, books]);

  const workloadMaximum = Math.max(
    1,
    ...workload.map((item) => item.count),
  );

  const pendingWorkloadTotal = workload.reduce(
    (total, item) => total + item.count,
    0,
  );

  const availableSmartAreaPages = useMemo(
    () =>
      Array.from(
        new Set(
          books
            .map((book) => Number(book.smartAreaPage || 0))
            .filter((value) => value > 0),
        ),
      ).sort((left, right) => left - right),
    [books],
  );

  const latestSmartAreaPage =
    availableSmartAreaPages[availableSmartAreaPages.length - 1] ?? null;

  const selectedPageIndex =
    selectedSmartAreaPage === null
      ? -1
      : availableSmartAreaPages.indexOf(selectedSmartAreaPage);

  const visibleSmartAreaPages = useMemo(() => {
    if (availableSmartAreaPages.length <= 5) return availableSmartAreaPages;

    const activeIndex =
      selectedPageIndex >= 0
        ? selectedPageIndex
        : availableSmartAreaPages.length - 1;
    const start = Math.min(
      Math.max(activeIndex - 2, 0),
      availableSmartAreaPages.length - 5,
    );

    return availableSmartAreaPages.slice(start, start + 5);
  }, [availableSmartAreaPages, selectedPageIndex]);

  const filteredBooks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("th");

    const result = books.filter((book) => {
      const hasOwnTask = book.tasks.some(
        (task) => task.assigneeId === currentUserId,
      );

      const inSelectedView =
        viewMode === "clerk"
          ? book.status === "clerk_review" ||
            book.status === "director_review"
          : viewMode === "mine"
            ? hasOwnTask && book.status !== "done"
            : viewMode === "all"
              ? book.status !== "done"
              : workspaceMode === "member"
                ? hasOwnTask && book.status === "done"
                : book.status === "done";

      if (!inSelectedView) return false;
      if (
        viewMode !== "mine" &&
        selectedSmartAreaPage !== null &&
        Number(book.smartAreaPage || 0) !== selectedSmartAreaPage
      ) {
        return false;
      }
      if (statusFilter !== "all" && book.status !== statusFilter) return false;
if (
        assigneeFilter !== "all" &&
        !book.tasks.some((task) => task.assigneeId === assigneeFilter)
      ) {
        return false;
      }

      if (!normalized) return true;

      return [
        book.subject,
        book.sourceAgency,
        book.registrationNumber,
        book.documentNumber,
        book.documentType,
        book.smartAreaPage ? `หน้า ${book.smartAreaPage}` : "",
        book.tasks.map((task) => task.assigneeName).join(" "),
      ].some((value) => value.toLocaleLowerCase("th").includes(normalized));
    });

    const sorted = [...result].sort((left, right) => {
      if (selectedSmartAreaPage === null || sortMode === "newest") {
        const latestDifference = bookLatestValue(right) - bookLatestValue(left);
        if (latestDifference !== 0) return latestDifference;
      }

      const pageDifference =
        Number(left.smartAreaPage || 0) - Number(right.smartAreaPage || 0);

      if (pageDifference !== 0) return pageDifference;

      const orderDifference =
        Number(right.smartAreaOrder || 0) - Number(left.smartAreaOrder || 0);

      if (orderDifference !== 0) return orderDifference;

      return (
        registrationValue(right.registrationNumber) -
        registrationValue(left.registrationNumber)
      );
    });

    if (selectedSmartAreaPage === null) return sorted.slice(0, 20);

    return sorted;
  }, [
    books,
    assigneeFilter,
    currentUserId,
    query,
    selectedSmartAreaPage,
    sortMode,
    statusFilter,
    viewMode,
    workspaceMode,
  ]);

  useEffect(() => {
    if (keepSelectedBookOnFilterChangeRef.current) {
      keepSelectedBookOnFilterChangeRef.current = false;
      return;
    }

    setSelectedBook(null);
  }, [
    assigneeFilter,
    query,
    selectedSmartAreaPage,
    statusFilter,
    viewMode,
  ]);

  useEffect(() => {
    if (
      selectedSmartAreaPage !== null &&
      availableSmartAreaPages.length > 0 &&
      !availableSmartAreaPages.includes(selectedSmartAreaPage)
    ) {
      setSelectedSmartAreaPage(
        availableSmartAreaPages[availableSmartAreaPages.length - 1],
      );
    }
  }, [availableSmartAreaPages, selectedSmartAreaPage]);

  useEffect(() => {
    if (
      returnBookHandledRef.current ||
      books.length === 0 ||
      typeof window === "undefined"
    ) {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const requestedBookId =
      searchParams.get("book") ||
      window.sessionStorage.getItem("smart-area-open-book-id") ||
      "";

    if (!requestedBookId) {
      returnBookHandledRef.current = true;
      return;
    }

    window.sessionStorage.removeItem("smart-area-open-book-id");

    const requestedBook = books.find((book) => book.id === requestedBookId);

    if (!requestedBook) {
      returnBookHandledRef.current = true;
      return;
    }

    returnBookHandledRef.current = true;
    keepSelectedBookOnFilterChangeRef.current = true;
    setStatusFilter("all");
    setAssigneeFilter("all");
    setViewMode(workspaceMode === "manager" ? "all" : "mine");

    if (requestedBook.smartAreaPage) {
      setSelectedSmartAreaPage(Number(requestedBook.smartAreaPage));
    }

    setSelectedBook(requestedBook);
    void markBookRead(requestedBook);

    window.requestAnimationFrame(() => {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const targetId = isMobile
        ? `mobile-book-${requestedBookId}`
        : `book-${requestedBookId}`;

      document
        .getElementById(targetId)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [books]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBrand}>
          <div className={styles.heroProfile}>
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={profileSummary.fullName || "รูปโปรไฟล์"}
              />
            ) : (
              <span>
                {(profileSummary.fullName || "ผู้").trim().charAt(0)}
              </span>
            )}
          </div>
          <div>
            <p className={styles.heroEyebrow}>SMART AREA</p>
            <h1>หนังสือราชการ</h1>
            <p className={styles.heroUserName}>
              {profileSummary.fullName || "กำลังโหลดข้อมูลผู้ใช้"}
            </p>
            <p className={styles.heroPosition}>
              {profileSummary.position || "ไม่ระบุตำแหน่ง"}
            </p>
          </div>
        </div>

        <button
          type="button"
          className={styles.refreshButton}
          onClick={() => void loadBooks()}
          disabled={loading}
        >
          <span aria-hidden="true">↻</span>
          {loading ? "กำลังโหลด..." : "โหลดข้อมูลใหม่"}
        </button>
      </section>

      <section className={styles.summaryGrid}>
        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryAll}`}
          onClick={() => {
            setViewMode(workspaceMode === "member" ? "mine" : "all");
            setStatusFilter("all");
          }}
        >
          <span className={styles.summaryIcon}>▤</span>
          <span>
            <small>หนังสือทั้งหมด</small>
            <strong>{summary.all}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryPending}`}
          onClick={() => {
            setViewMode(workspaceMode === "member" ? "mine" : "all");
            setStatusFilter("director_review");
          }}
        >
          <span className={styles.summaryIcon}>◉</span>
          <span>
            <small>รอพิจารณา</small>
            <strong>{summary.pendingReview}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryProgress}`}
          onClick={() => {
            setViewMode(workspaceMode === "member" ? "mine" : "all");
            setStatusFilter("in_progress");
          }}
        >
          <span className={styles.summaryIcon}>◷</span>
          <span>
            <small>กำลังดำเนินการ</small>
            <strong>{summary.activeWork}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryDone}`}
          onClick={() => {
            setViewMode("archive");
            setStatusFilter("all");
          }}
        >
          <span className={styles.summaryIcon}>✓</span>
          <span>
            <small>เสร็จแล้ว</small>
            <strong>{summary.done}</strong>
          </span>
        </button>
      </section>

      <section
        className={`${styles.workspace} ${
          workloadCollapsed ? styles.workspaceCollapsed : ""
        }`}
      >
        <div className={styles.mainPanel}>
          <div className={styles.viewTabs}>
            {workspaceMode === "clerk" && (
              <button
                type="button"
                className={viewMode === "clerk" ? styles.activeTab : ""}
                onClick={() => {
                  setViewMode("clerk");
                  setStatusFilter("all");
                  setAssigneeFilter("all");
                }}
              >
                งานธุรการ
                <span>
                  {
                    books.filter(
                      (book) =>
                        book.status === "clerk_review" ||
                        book.status === "director_review",
                    ).length
                  }
                </span>
              </button>
            )}

            {workspaceMode !== "manager" && (
              <button
                type="button"
                className={viewMode === "mine" ? styles.activeTab : ""}
                onClick={() => {
                  setViewMode("mine");
                  setStatusFilter("all");
                  setAssigneeFilter("all");
                }}
              >
                งานของฉัน
                <span className={styles.mineCount}>
                  {
                    books.filter(
                      (book) =>
                        book.status !== "done" &&
                        book.tasks.some(
                          (task) => task.assigneeId === currentUserId,
                        ),
                    ).length
                  }
                </span>
              </button>
            )}

            {workspaceMode !== "member" && (
              <button
                type="button"
                className={viewMode === "all" ? styles.activeTab : ""}
                onClick={() => {
                  setViewMode("all");
                  setStatusFilter("all");
                  setAssigneeFilter("all");
                }}
              >
                งานทั้งหมด
                <span>{books.filter((book) => book.status !== "done").length}</span>
              </button>
            )}

            <button
              type="button"
              className={viewMode === "archive" ? styles.activeTab : ""}
              onClick={() => {
                setViewMode("archive");
                setStatusFilter("all");
                setAssigneeFilter("all");
              }}
            >
              คลังเสร็จแล้ว
              <span>
                {
                  books.filter(
                    (book) =>
                      book.status === "done" &&
                      (workspaceMode !== "member" ||
                        book.tasks.some(
                          (task) => task.assigneeId === currentUserId,
                        )),
                  ).length
                }
              </span>
            </button>
          </div>

          <div className={styles.toolbar}>
            <label className={styles.searchField}>
              <span className={styles.visuallyHidden}>ค้นหา</span>
              <span className={styles.searchIcon} aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาเรื่อง เลขรับ หน่วยงาน ผู้รับผิดชอบ..."
              />
            </label>

            <label className={styles.selectField}>
              <span>สถานะ</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">ทั้งหมด</option>
                {Object.entries(statusLabels)
                  .filter(([value]) =>
                    viewMode === "archive" ? value === "done" : value !== "done",
                  )
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          <label className={styles.selectField}>
            <span>ผู้รับผิดชอบ</span>
            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
            >
              <option value="all">ทุกคน</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.fullName}
                </option>
              ))}
            </select>
          </label>
          </div>

          {message && <div className={styles.errorBox}>{message}</div>}
          {successMessage && (
            <div className={styles.successBox}>{successMessage}</div>
          )}

          <div className={styles.resultBar}>
            <div>
              <strong>
                {viewMode === "clerk"
                  ? "งานธุรการ"
                  : viewMode === "mine"
                    ? "งานของฉัน"
                    : viewMode === "all"
                      ? "งานทั้งหมด"
                      : "คลังเสร็จแล้ว"}
              </strong>
              <span>
                {selectedSmartAreaPage
                  ? `หน้า ${selectedSmartAreaPage} · ${filteredBooks.length} รายการ`
                  : `${filteredBooks.length} หนังสือล่าสุด`}
              </span>
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                onClick={() => {
                  if (selectedPageIndex > 0) {
                    setSelectedSmartAreaPage(
                      availableSmartAreaPages[selectedPageIndex - 1],
                    );
                  }
                }}
                disabled={selectedPageIndex <= 0}
                aria-label="หน้าก่อนหน้า"
              >
                ‹
              </button>

              {visibleSmartAreaPages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={
                    pageNumber === selectedSmartAreaPage
                      ? styles.activeSourcePage
                      : ""
                  }
                  onClick={() => setSelectedSmartAreaPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  if (
                    selectedPageIndex >= 0 &&
                    selectedPageIndex < availableSmartAreaPages.length - 1
                  ) {
                    setSelectedSmartAreaPage(
                      availableSmartAreaPages[selectedPageIndex + 1],
                    );
                  }
                }}
                disabled={
                  selectedPageIndex < 0 ||
                  selectedPageIndex >= availableSmartAreaPages.length - 1
                }
                aria-label="หน้าถัดไป"
              >
                ›
              </button>

              <button
                type="button"
                className={styles.latestSourcePage}
                onClick={() => setSelectedSmartAreaPage(null)}
                disabled={latestSmartAreaPage === null && books.length === 0}
              >
                ล่าสุด
              </button>
            </div>
          </div>


          {/* SMART AREA MOBILE V5.3 START */}
          <div className={styles.mobileDocumentList}>
            {filteredBooks.map((book) => {
              const source = sourceDisplayParts(book.sourceAgency);
              const isSelected = selectedBook?.id === book.id;
              const ownAssignedTask = book.tasks.find(
                (task) =>
                  task.assigneeId === currentUserId &&
                  task.status === "assigned",
              );
              const ownInProgressTask = book.tasks.find(
                (task) =>
                  task.assigneeId === currentUserId &&
                  task.status === "in_progress",
              );

              return (
                <article
                  key={`mobile-${book.id}`}
                  id={`mobile-book-${book.id}`}
                  className={styles.mobileDocumentCard}
                >
                  <div className={styles.mobileCardTopline}>
                    <MailStateIcon isRead={book.isRead} urgency={book.urgency} />

                    {!book.isRead ? (
                      <span className={styles.mobileNewBadge}>
                        <span className={styles.mobileUnreadDot} />
                        ใหม่
                      </span>
                    ) : (
                      <span className={styles.mobileReadBadge}>
                        <span className={styles.mobileReadCheck}>✓</span>
                        อ่านแล้ว
                      </span>
                    )}

                    

                    <span
                      className={`${styles.statusBadge} ${
                        styles[`status_${book.status}`] || ""
                      }`}
                    >
                      {getStatusLabel(book.status)}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={styles.mobileSubjectButton}
                    onClick={() => {
                      mobileScrollYRef.current = window.scrollY;
                      void markBookRead(book);
                      setSelectedBook(book);
                    }}
                  >
                    {book.subject}
                  </button>

                  <div className={styles.mobileMetaGrid}>
                    <div>
                      <span>เลขรับ</span>
                      <strong>{book.registrationNumber || "-"}</strong>
                    </div>
                    <div>
                      <span>วันที่รับ</span>
                      <strong>{formatDate(book.receivedDate)}</strong>
                    </div>
                    <div>
                      <span>เลขที่หนังสือ</span>
                      <strong>{book.documentNumber || "-"}</strong>
                    </div>
                    <div>
                      <span>ลงวันที่</span>
                      <strong>{formatDate(book.documentDate)}</strong>
                    </div>
                    <div>
                      <span>จาก</span>
                      <strong>{source.name}</strong>
                      {source.group && <small>{source.group}</small>}
                    </div>
                    <div>
                      <span>ผู้รับผิดชอบ</span>
                      <strong>{assigneeFirstNames(book.tasks)}</strong>
                    </div>
                  </div>

                  <div className={styles.mobileFiles}>
                    <span className={styles.mobileSectionLabel}>ไฟล์แนบ</span>
                    {book.attachments.length === 0 ? (
                      <span className={styles.noFile}>ไม่มีไฟล์แนบ</span>
                    ) : (
                      orderedAttachments(book.attachments).map((attachment, index) =>
                        attachment.openUrl ? (
                          <a
                            key={attachment.id}
                            href={attachment.openUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={attachment.fileName}
                          
                            data-assignment-state={
                              attachment.attachmentType === "signed"
                                ? assignmentState(book, currentUserId)
                                : undefined
                            }
                            onClick={() => {
                              void markAssignmentRead(book, attachment);
                            }}
                          >
                            {attachment.attachmentType !== "signed" && (
                              <span>
                                {originalAttachmentNumber(book, attachment)}.
                              </span>
                            )}
                            <span>
                              {attachmentDisplayLabel(attachment, book, currentUserId)}
                            </span>
                          </a>
                        ) : (
                          <span
                            key={attachment.id}
                            className={styles.missingFile}
                          >
                            {attachment.attachmentType === "signed" ? "ไม่พบไฟล์แจ้งมอบหมาย" : `${originalAttachmentNumber(book, attachment)}. ไม่พบไฟล์`}
                          </span>
                        ),
                      )
                    )}
                  </div>

                  <div className={styles.mobilePrimaryActions}>
                    <button
                      type="button"
                      className={styles.mobileDetailsButton}
                      onClick={() => {
                        mobileScrollYRef.current = window.scrollY;
                      void markBookRead(book);
                      setSelectedBook(book);
                      }}
                    >
                      เปิดรายละเอียด
                    </button>

                    {workspaceMode === "manager" &&
                      capabilities.canClose &&
                      book.status !== "done" && (
                        <button
                          type="button"
                          className={`${styles.doneAction} ${styles.mobileFinishButton}`}
                          onClick={() => closeBookAsDone(book)}
                          disabled={savingKey === `close:${book.id}`}
                        >
                          เสร็จสิ้น
                        </button>
                      )}

                    {workspaceMode !== "manager" &&
                      capabilities.canSubmit &&
                      book.status === "clerk_review" && (
                        <button
                          type="button"
                          className={`${styles.primaryAction} ${styles.mobileSubmitButton}`}
                          onClick={() =>
                            void postAction(
                              { action: "submit", bookId: book.id },
                              `submit:${book.id}`,
                            )
                          }
                          disabled={savingKey === `submit:${book.id}`}
                        >
                          เสนอ ผอ.
                        </button>
                      )}

                    {ownAssignedTask && (
                      <button
                        type="button"
                        className={styles.primaryAction}
                        onClick={() =>
                          void updateTaskStatus(
                            ownAssignedTask.id,
                            "in_progress",
                          )
                        }
                        disabled={savingKey === ownAssignedTask.id}
                      >
                        รับทราบ
                      </button>
                    )}

                    {ownInProgressTask && (
                      <button
                        type="button"
                        className={styles.doneAction}
                        onClick={() =>
                          void updateTaskStatus(
                            ownInProgressTask.id,
                            "done",
                          )
                        }
                        disabled={savingKey === ownInProgressTask.id}
                      >
                        เสร็จสิ้น
                      </button>
                    )}
                  </div>

                  {isSelected && (
                    <div
                      className={styles.mobileDetailOverlay}
                      role="dialog"
                      aria-modal="true"
                      aria-label={`รายละเอียดหนังสือ ${book.subject}`}
                    >
                      <div className={styles.mobileDetailPage}>
                        <header className={styles.mobileDetailTopbar}>
                          <div>
                            <span className={styles.mobileDetailEyebrow}>
                              รายละเอียดหนังสือราชการ
                            </span>
                            <span className={styles.mobileDetailSubjectLabel}>
                              เรื่อง
                            </span>
                            <strong>{book.subject}</strong>
                            <small className={styles.mobileDetailReference}>
                              {book.documentNumber ||
                                book.registrationNumber ||
                                "ไม่มีเลขที่หนังสือ"}
                            </small>
                          </div>
                          <button
                            type="button"
                            onClick={closeMobileDetail}
                            aria-label="ปิดรายละเอียดและกลับหน้าหนังสือราชการ"
                            className={styles.mobileCloseButton}
                          >
                            ×
                          </button>
                        </header>

                        <main className={styles.mobileDetailScroll}>
                          <div className={styles.mobileDetailStatusRow}>
                            <MailStateIcon isRead={book.isRead} urgency={book.urgency} />

                            {!book.isRead ? (
                              <span className={styles.mobileNewBadge}>
                                <span className={styles.mobileUnreadDot} />
                                ใหม่
                              </span>
                            ) : (
                              <span className={styles.mobileReadBadge}>
                                <span className={styles.mobileReadCheck}>
                                  ✓
                                </span>
                                อ่านแล้ว
                              </span>
                            )}

                            
                          </div>

                          <div className={styles.mobileDetailGrid}>
                            <section>
                              <span>เลขทะเบียนรับ</span>
                              <strong>
                                {book.registrationNumber || "-"}
                              </strong>
                            </section>
                            <section>
                              <span>เลขที่หนังสือ</span>
                              <strong>{book.documentNumber || "-"}</strong>
                            </section>
                            <section>
                              <span>วันที่รับ</span>
                              <strong>{formatDate(book.receivedDate)}</strong>
                            </section>
                            <section>
                              <span>ลงวันที่</span>
                              <strong>
                                {formatDate(book.documentDate)}
                              </strong>
                            </section>
<section>
  <span>ชั้นความเร็ว</span>
  <strong
    className={
      isMostUrgent(book.urgency)
        ? styles.detailSpeedCritical
        : styles.detailSpeedNormal
    }
  >
    {book.urgency || "ปกติ"}
  </strong>
</section>
                            <section className={styles.mobileDetailWide}>
                              <span>จาก</span>
                              <strong>{source.name}</strong>
                              {source.group && <small>{source.group}</small>}
                            </section>
                            <section className={styles.mobileDetailWide}>
                              <span>ผู้รับผิดชอบ</span>
                              <strong>
                                {assigneeFirstNames(book.tasks)}
                              </strong>
                            </section>
                          </div>

                          <section className={styles.mobileDetailFiles}>
                            <span>ไฟล์แนบ</span>
                            {book.attachments.length === 0 ? (
                              <p>ไม่มีไฟล์แนบ</p>
                            ) : (
                              orderedAttachments(book.attachments).map((attachment, index) =>
                                attachment.openUrl ? (
                                  <a
                                    key={attachment.id}
                                    href={attachment.openUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  
                            data-assignment-state={
                              attachment.attachmentType === "signed"
                                ? assignmentState(book, currentUserId)
                                : undefined
                            }
                            onClick={() => {
                              void markAssignmentRead(book, attachment);
                            }}
                          >
                                    {attachment.attachmentType !== "signed" && (
                              <span>
                                {originalAttachmentNumber(book, attachment)}.
                              </span>
                            )}
                                    <span>
                                      {attachmentDisplayLabel(attachment, book, currentUserId)}
                                    </span>
                                  </a>
                                ) : (
                                  <p key={attachment.id}>
                                    {attachment.attachmentType === "signed" ? "ไม่พบไฟล์แจ้งมอบหมาย" : `${originalAttachmentNumber(book, attachment)}. ไม่พบไฟล์`}
                                  </p>
                                ),
                              )
                            )}
                          </section>

                          <section className={styles.mobileDetailText}>
                            <span>หมายเหตุ</span>
                            <p>{book.note || "-"}</p>
                          </section>

                          <section className={styles.mobileDetailText}>
                            <span>ข้อความสั่งการ</span>
                            <p>{book.directorNote || "-"}</p>
                          </section>
                        </main>

                        <footer className={styles.mobileDetailActions}>
                          {capabilities.canAssign &&
                            book.status !== "done" && (
                              <button
                                type="button"
                                className={styles.signAssignButton}
                                onClick={() =>
                                  router.push(
                                    `/documents/sign/${book.id}`,
                                  )
                                }
                              >
                                ลงนามและมอบหมาย
                              </button>
                            )}

                          {capabilities.canAssign &&
                            book.status !== "done" && (
                              <button
                                type="button"
                                className={styles.assignDetailButton}
                                onClick={() => openAssignment(book)}
                              >
                                {book.tasks.length > 0
                                  ? "แก้ไขผู้รับมอบหมาย"
                                  : "มอบหมายโดยไม่ลงนาม"}
                              </button>
                            )}

                          {workspaceMode === "manager" &&
                      capabilities.canClose &&
                      book.status !== "done" && (
                              <button
                                type="button"
                                className={styles.doneAction}
                                onClick={() => {
                                const hasIncompleteAssignments = book.tasks.some(
                                  (task) => task.status !== "done",
                                );
                                const confirmed = window.confirm(
                                  hasIncompleteAssignments
                                    ? "เรื่องนี้ยังมีผู้รับมอบหมายที่ทำงานไม่เสร็จ ยืนยันปิดเรื่องเป็นเสร็จสิ้นหรือไม่"
                                    : "ยืนยันปิดเรื่องนี้เป็นเสร็จสิ้นหรือไม่",
                                );
                                if (!confirmed) return;
                                void postAction(
                                    {
                                      action: "close",
                                      bookId: book.id,
                                      note: "ผอ. ปิดเรื่องเป็นเสร็จสิ้น",
                                    },
                                    `close:${book.id}`,
                                  );
                              }}
                                disabled={
                                  savingKey === `close:${book.id}`
                                }
                              >
                                เสร็จสิ้น
                              </button>
                            )}
                        </footer>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {/* SMART AREA MOBILE V5.3 END */}

          <div className={styles.tableWrap}>
            <table className={styles.bookTable}>
              <thead>
                <tr>
                  <th>ที่</th>
                  <th>เรื่อง / ไฟล์แนบ</th>
                  <th>จาก</th>
                  <th>สถานะ</th>
                  <th>ผู้รับผิดชอบ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredBooks.map((book) => (
                  <Fragment key={book.id}>
                  <tr
                    id={`book-${book.id}`}
                    className={
                      selectedBook?.id === book.id ? styles.selectedRow : ""
                    }
                  >
                    <td data-label="ลำดับ">
                      <div className={styles.registrationCell}>
                        <strong>{book.registrationNumber || "-"}</strong>
                        {book.documentNumber && (
                          <small className={styles.documentNumber}>
                            {book.documentNumber}
                          </small>
                        )}
                        <small>
                          หน้า {book.smartAreaPage || "-"} · ID {book.legacySmartAreaId || "-"}
                        </small>
                        <small>
                          เลขรับ {book.registrationNumber || "-"} · รับ{" "}
                          {formatDate(book.receivedDate)} · ลงวันที่{" "}
                          {formatDate(book.documentDate)} · อัปเดต{" "}
                          {book.updatedAt
                            ? new Intl.DateTimeFormat("th-TH", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(book.updatedAt))
                            : "-"}
                        </small>
                      </div>
                    </td>

                    <td data-label="เรื่อง / ไฟล์แนบ">
                      <div className={styles.subjectCell}>
                        <div className={styles.subjectTopline}>
                          <MailStateIcon isRead={book.isRead} urgency={book.urgency} />

                          {!book.isRead ? (
                            <span className={styles.desktopNewBadge}>
                              <span className={styles.desktopUnreadDot} />
                              ใหม่
                            </span>
                          ) : (
                            <span className={styles.desktopReadBadge}>
                              <span className={styles.desktopReadCheck}>✓</span>
                              อ่านแล้ว
                            </span>
                          )}

                          

                          {book.documentType && (
                            <span className={styles.typeBadge}>
                              {book.documentType}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`${styles.subjectButton} ${
                            selectedBook?.id === book.id
                              ? styles.selectedSubject
                              : ""
                          }`}
                          onClick={() => {
                            void markBookRead(book);
                            setSelectedBook((current) =>
                              current?.id === book.id ? null : book,
                            );
                          }}
                        >
                          {book.subject}
                        </button>
                        <div className={styles.fileLinks}>
                          {book.attachments.length === 0 && (
                            <span className={styles.noFile}>ไม่มีไฟล์แนบ</span>
                          )}
                          {orderedAttachments(book.attachments).map((attachment, index) =>
                            attachment.openUrl ? (
                              <a
                                key={attachment.id}
                                className={styles.fileNameLink}
                                href={attachment.openUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={attachment.fileName}
                              
                            data-assignment-state={
                              attachment.attachmentType === "signed"
                                ? assignmentState(book, currentUserId)
                                : undefined
                            }
                            onClick={() => {
                              void markAssignmentRead(book, attachment);
                            }}
                          >
                                {attachment.attachmentType !== "signed" && (
                              <span>
                                {originalAttachmentNumber(book, attachment)}.
                              </span>
                            )}
                                <span>
                                  {attachmentDisplayLabel(attachment, book, currentUserId)}
                                </span>
                              </a>
                            ) : (
                              <span
                                key={attachment.id}
                                className={styles.missingFile}
                              >
                                {attachment.attachmentType === "signed" ? "ไม่พบไฟล์แจ้งมอบหมาย" : `${originalAttachmentNumber(book, attachment)}. ไม่พบไฟล์`}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    </td>

                    <td data-label="จาก" className={styles.fromColumn}>
                      {(() => {
                        const source = sourceDisplayParts(book.sourceAgency);

                        return (
                          <div className={styles.sourceCell}>
                            <span className={styles.sourceName}>
                              {source.name}
                            </span>
                            {source.group && (
                              <span className={styles.sourceGroup}>
                                {source.group}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    <td data-label="สถานะ">
                      <span
                        className={`${styles.statusBadge} ${
                          styles[`status_${book.status}`] || ""
                        }`}
                      >
                        {getStatusLabel(book.status)}
                      </span>
                    </td>

                    <td data-label="ผู้รับผิดชอบ">
                      <div className={styles.assigneeCell}>
                        <span>{assigneeFirstNames(book.tasks)}</span>
                      </div>
                    </td>

                    <td data-label="จัดการ">
                      <div className={styles.actionCell}>
                        {workspaceMode !== "manager" &&
                      capabilities.canSubmit &&
                          book.status === "clerk_review" && (
                            <button
                              type="button"
                              className={`${styles.primaryAction} ${styles.mobileSubmitButton}`}
                              onClick={() =>
                                void postAction(
                                  { action: "submit", bookId: book.id },
                                  `submit:${book.id}`,
                                )
                              }
                              disabled={savingKey === `submit:${book.id}`}
                            >
                              เสนอ ผอ.
                            </button>
                          )}

                        {book.tasks.some(
                          (task) =>
                            task.assigneeId === currentUserId &&
                            task.status === "assigned",
                        ) && (
                          <button
                            type="button"
                            className={styles.primaryAction}
                            onClick={() => {
                              const task = book.tasks.find(
                                (item) =>
                                  item.assigneeId === currentUserId &&
                                  item.status === "assigned",
                              );
                              if (task) {
                                void updateTaskStatus(task.id, "in_progress");
                              }
                            }}
                            disabled={book.tasks.some(
                              (task) =>
                                task.assigneeId === currentUserId &&
                                savingKey === task.id,
                            )}
                          >
                            เริ่ม
                          </button>
                        )}

                        {book.tasks.some(
                          (task) =>
                            task.assigneeId === currentUserId &&
                            task.status === "in_progress",
                        ) && (
                          <button
                            type="button"
                            className={styles.doneAction}
                            onClick={() => {
                              const task = book.tasks.find(
                                (item) =>
                                  item.assigneeId === currentUserId &&
                                  item.status === "in_progress",
                              );
                              if (task) {
                                void updateTaskStatus(task.id, "done");
                              }
                            }}
                            disabled={book.tasks.some(
                              (task) =>
                                task.assigneeId === currentUserId &&
                                savingKey === task.id,
                            )}
                          >
                            เสร็จสิ้น
                          </button>
                        )}

                        {workspaceMode === "manager" &&
                      capabilities.canClose &&
                      book.status !== "done" && (
                            <button
                              type="button"
                              className={styles.doneAction}
                              onClick={() => {
                                const hasIncompleteAssignments = book.tasks.some(
                                  (task) => task.status !== "done",
                                );
                                const confirmed = window.confirm(
                                  hasIncompleteAssignments
                                    ? "เรื่องนี้ยังมีผู้รับมอบหมายที่ทำงานไม่เสร็จ ยืนยันปิดเรื่องเป็นเสร็จสิ้นหรือไม่"
                                    : "ยืนยันปิดเรื่องนี้เป็นเสร็จสิ้นหรือไม่",
                                );
                                if (!confirmed) return;
                                void postAction(
                                  {
                                    action: "close",
                                    bookId: book.id,
                                    note: "ผอ. ปิดเรื่องเป็นเสร็จสิ้น",
                                  },
                                  `close:${book.id}`,
                                );
                              }}
                              disabled={savingKey === `close:${book.id}`}
                            >
                              เสร็จสิ้น
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>

                  {selectedBook?.id === book.id && (
                    <tr className={`${styles.detailRow} ${styles.selectedDetailRow}`}>
                      <td colSpan={6}>
                        <div className={styles.inlineDetail}>
                          <div className={styles.inlineDetailHeader}>
                            <div>
                              <span>รายละเอียดหนังสือ</span>
                              <strong>{book.subject}</strong>
                            </div>
                            <div className={styles.inlineDetailActions}>
                              {capabilities.canAssign &&
                                book.status !== "done" && (
                                  <button
                                    type="button"
                                    className={styles.signAssignButton}
                                    onClick={() =>
                                      router.push(`/documents/sign/${book.id}`)
                                    }
                                  >
                                    ลงนาม/มอบหมาย
                                  </button>
                                )}
                              {capabilities.canAssign &&
                                book.status !== "done" && (
                                  <button
                                    type="button"
                                    className={styles.assignDetailButton}
                                    onClick={() => openAssignment(book)}
                                  >
                                    {book.tasks.length > 0
                                      ? "แก้ไขผู้รับมอบหมาย"
                                      : "มอบหมายโดยไม่ลงนาม"}
                                  </button>
                                )}
                              <button
                                type="button"
                                className={styles.closeDetailButton}
                                onClick={() => setSelectedBook(null)}
                                aria-label="ปิดรายละเอียด"
                                title="ปิดรายละเอียด"
                              >
                                ×
                              </button>
                            </div>
                          </div>

                          <div className={styles.inlineDetailGrid}>
                            <div>
                              <span>เลขทะเบียนรับ</span>
                              <strong>{book.registrationNumber || "-"}</strong>
                            </div>
                            <div>
                              <span>วันที่รับ</span>
                              <strong>{formatDate(book.receivedDate)}</strong>
                            </div>
                            <div>
                              <span>เลขที่หนังสือ</span>
                              <strong>{book.documentNumber || "-"}</strong>
                            </div>
                            <div>
                              <span>ลงวันที่</span>
                              <strong>{formatDate(book.documentDate)}</strong>
                            </div>
                            <div>
                              <span>จากหน่วยงาน</span>
                              <strong>{book.sourceAgency || "-"}</strong>
                            </div>
                            <div>
  <span>ประเภท / ชั้นความเร็ว</span>
  <strong
    className={
      isMostUrgent(book.urgency)
        ? styles.detailSpeedCritical
        : styles.detailSpeedNormal
    }
  >
    {[book.documentType, book.urgency]
      .filter(Boolean)
      .join(" · ") || "-"}
  </strong>
</div>
                          </div>

                          <div className={styles.inlineDetailSections}>
                            <div>
                              <span>หมายเหตุ</span>
                              <p>{book.note || "-"}</p>
                            </div>
                            <div>
                              <span>ข้อความสั่งการ</span>
                              <p>{book.directorNote || "-"}</p>
                            </div>
                            <div>
                              <span>ผู้รับผิดชอบ</span>
                              <p>
                                {book.tasks.length > 0
                                  ? book.tasks
                                      .map(
                                        (task) =>
                                          `${task.assigneeName || "ไม่ระบุชื่อ"} (${getStatusLabel(task.status)})`,
                                      )
                                      .join(", ")
                                  : "-"}
                              </p>
                            </div>
                            <div>
                              <span>ไฟล์แนบ</span>
                              <div className={styles.detailFiles}>
                                {book.attachments.length === 0 && <span>-</span>}
                                {orderedAttachments(book.attachments).map((attachment, index) =>
                                  attachment.openUrl ? (
                                    <a
                                      key={attachment.id}
                                      href={attachment.openUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={attachment.fileName}
                                    
                            data-assignment-state={
                              attachment.attachmentType === "signed"
                                ? assignmentState(book, currentUserId)
                                : undefined
                            }
                            onClick={() => {
                              void markAssignmentRead(book, attachment);
                            }}
                          >
                                      {attachment.attachmentType !== "signed" && (
                              <span>
                                {originalAttachmentNumber(book, attachment)}.
                              </span>
                            )}
                                      <span>
                                        {attachmentDisplayLabel(attachment, book, currentUserId)}
                                      </span>
                                    </a>
                                  ) : (
                                    <span key={attachment.id}>
                                      {attachment.attachmentType === "signed" ? "ไม่พบไฟล์แจ้งมอบหมาย" : `${originalAttachmentNumber(book, attachment)}. ไม่พบไฟล์`}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}

                {!loading && filteredBooks.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        <strong>ไม่พบรายการหนังสือ</strong>
                        <span>ลองเปลี่ยนคำค้นหา ตัวกรอง หรือแท็บรายการ</span>
                      </div>
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        <strong>กำลังโหลดข้อมูล</strong>
                        <span>โปรดรอสักครู่</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside
          className={`${styles.workloadPanel} ${
            workloadCollapsed ? styles.workloadPanelCollapsed : ""
          }`}
        >
          <button
            type="button"
            className={styles.workloadToggle}
            onClick={() => setWorkloadCollapsed((current) => !current)}
            aria-label={workloadCollapsed ? "ขยายสรุปภาระงาน" : "ยุบสรุปภาระงาน"}
            title={workloadCollapsed ? "ขยายสรุปภาระงาน" : "ยุบสรุปภาระงาน"}
          >
            {workloadCollapsed ? "▶" : "◀"}
          </button>
          <div className={styles.workloadContent}>
            <div className={styles.workloadHeader}>
              <h2>สรุปภาระงาน</h2>
              <span>{pendingWorkloadTotal}</span>
            </div>

            <div className={styles.workloadList}>
              {workload.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={
                    assigneeFilter === item.id
                      ? styles.workloadPersonActive
                      : ""
                  }
                  title={`${item.fullName} ค้าง ${item.count} งาน`}
                  onClick={() => {
                    setViewMode(workspaceMode === "member" ? "mine" : "all");
                    setStatusFilter("all");
                    setAssigneeFilter((current) =>
                      current === item.id ? "all" : item.id,
                    );
                  }}
                >
                  <span className={styles.workloadPersonName}>
                    {item.name}
                  </span>
                  <span
                    className={styles.workloadBlocks}
                    aria-label={`${item.count} งานค้าง`}
                  >
                    {item.count === 0 ? (
                      <span className={styles.workloadZero}>—</span>
                    ) : (
                      Array.from({ length: item.count }, (_, blockIndex) => (
                        <span
                          key={blockIndex}
                          className={styles.workloadBlock}
                          style={{
                            backgroundColor: workloadBlockColor(blockIndex),
                          }}
                        />
                      ))
                    )}
                  </span>
                  <strong>{item.count}</strong>
                </button>
              ))}

              {workload.length === 0 && (
                <div className={styles.workloadEmpty}>
                  ยังไม่มีรายชื่อผู้รับมอบหมาย
                </div>
              )}
            </div>


          </div>
        </aside>
      </section>

      {editingBook && (
        <div className={styles.modalBackdrop}>
          <section className={styles.assignmentModal}>
            <div className={styles.modalHeader}>
              <div>
                <p>มอบหมายงาน</p>
                <h2>{editingBook.subject}</h2>
              </div>
              <button type="button" onClick={() => setEditingBook(null)}>
                ปิด
              </button>
            </div>

            <div className={styles.assigneeGrid}>
              {assignees.map((person) => {
                const checked = selectedAssigneeIds.includes(person.id);

                return (
                  <label key={person.id} className={styles.assigneeOption}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedAssigneeIds((current) =>
                          checked
                            ? current.filter((id) => id !== person.id)
                            : [...current, person.id],
                        )
                      }
                    />
                    <span>
                      <strong>{person.fullName}</strong>
                      <small>{person.position || "ไม่ระบุตำแหน่ง"}</small>
                    </span>
                  </label>
                );
              })}
            </div>

            <label className={styles.noteField}>
              <span>ข้อความสั่งการ</span>
              <textarea
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value)}
                placeholder="เช่น มอบหมายให้ดำเนินการและรายงานผล"
              />
            </label>

            <div className={styles.modalActions}>
              <button type="button" onClick={() => setEditingBook(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void saveAssignment()}
                disabled={
                  selectedAssigneeIds.length === 0 ||
                  savingKey.startsWith("assign:")
                }
              >
                บันทึกการมอบหมาย
              </button>
            </div>
          </section>
        </div>
      )}

      <footer className={styles.documentFooter}>
        <div>
          ระบบสารบรรณโรงเรียนจากข้อมูล Smart Area · โรงเรียนวัดไผ่มุ้ง
        </div>
        <div>
          อัปเดตล่าสุด{" "}
          {lastLoadedAt
            ? new Intl.DateTimeFormat("th-TH", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(lastLoadedAt)
            : "-"}{" "}
          · เวอร์ชัน {extensionInfo.version || "-"}
        </div>
        <div>
          <a
            href={extensionInfo.downloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            ดาวน์โหลด Extension {extensionInfo.version || "-"}
          </a>{" "}
          · © 2026 นายสุธน พุทธรัตน์ ผู้อำนวยการโรงเรียนวัดไผ่มุ้ง
          · สงวนลิขสิทธิ์ · โทร. 086-6271047
        </div>
      </footer>

    </main>
  );
}
