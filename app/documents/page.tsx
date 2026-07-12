"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";
import SmartAreaImportButton from "./components/SmartAreaImportButton";

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

type ExtensionInfo = {
  version: string;
  downloadUrl: string;
};

type SortMode = "newest" | "oldest" | "registration";
type ViewMode = "clerk" | "director" | "mine" | "all" | "archive";
type WorkAttentionFilter = "all" | "new" | "pending";
type WorkspaceMode = "manager" | "clerk" | "member";

const statusLabels: Record<string, string> = {
  clerk_review: "รอธุรการตรวจ",
  director_review: "รอ ผอ. พิจารณา",
  assigned: "มอบหมายแล้ว",
  in_progress: "กำลังดำเนินการ",
  done: "\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e2a\u0e34\u0e49\u0e19",
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

function formatUpdatedAt(value: string) {
  if (!value) return "\u0e2d\u0e31\u0e1e\u0e40\u0e14\u0e17 -";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${"\u0e2d\u0e31\u0e1e\u0e40\u0e14\u0e17"} ${value}`;
  return `${"\u0e2d\u0e31\u0e1e\u0e40\u0e14\u0e17"} ${new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)}`;
}

function getStatusLabel(status: string) {
  return statusLabels[status] || status || "-";
}

function DocumentListDate({ book }: { book: BookItem }) {
  return (
    <small className={styles.documentListDate}>
      <span>ลงวันที่ {formatDate(book.documentDate)}</span>
      <span>{formatUpdatedAt(book.updatedAt)}</span>
    </small>
  );
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

function responsibleDisplayName(value: string) {
  const name = shortThaiName(value);
  if (!name || name === "-") return "";
  return name.startsWith("\u0e04\u0e23\u0e39") ? name : "\u0e04\u0e23\u0e39" + name;
}


function assigneeStatusSymbol(status: string) {
  if (status === "done") return "\u2713";
  if (status === "in_progress") return "\u25cf";
  if (status === "assigned") return "\u25d4";
  return "\u25cb";
}

function AssigneeStatusNames({ tasks }: { tasks: TaskItem[] }) {
  const visibleTasks = tasks.filter((task) => responsibleDisplayName(task.assigneeName));

  if (visibleTasks.length === 0) return <span>-</span>;

  return (
    <span className={styles.assigneeStatusList}>
      {visibleTasks.map((task) => (
        <span key={task.id || task.assigneeId || task.assigneeName} className={styles.assigneeStatusItem}>
          <span
            className={[
              styles.assigneeStatusIcon,
              styles["assigneeStatus_" + task.status] || "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={getStatusLabel(task.status)}
            title={getStatusLabel(task.status)}
          >
            {assigneeStatusSymbol(task.status)}
          </span>
          <span>{responsibleDisplayName(task.assigneeName)}</span>
        </span>
      ))}
    </span>
  );
}

function sourceDisplayParts(value: string) {
  const raw = String(value || "").trim();

  if (!raw) {
    return { name: "-", group: "" };
  }

  const bracketValues = [...raw.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);

  const withoutPeople = raw.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const withoutUrgency = withoutPeople
    .replace(/^(ปกติ|ด่วนที่สุด|ด่วนมาก|ด่วน)\s*/u, "")
    .trim();

  const groupMatch = withoutUrgency.match(
    /((?:กลุ่ม|ฝ่าย|งาน)\s*[^\[\]\n\r]+?)(?=\s+(?:สำนักงาน|สพป\.|สพม\.|โดย|จาก|ผู้ส่ง|ผู้รับ)|$)/u,
  );

  const group = String(groupMatch?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();

  const lines = raw
    .split(/\r?\n|\s{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  const name =
    bracketValues.at(-1) ||
    lines.find(
      (line) =>
        !/^(ปกติ|ด่วน|ด่วนมาก|ด่วนที่สุด|กลุ่ม|ฝ่าย|งาน|สำนักงาน|สพป\.|สพม\.|รายละเอียด|เรื่อง|เลขที่|วันที่)/.test(
          line,
        ),
    ) ||
    withoutUrgency ||
    raw;

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

function urgencyFilterKey(value: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "");

  if (normalized.includes("\u0e14\u0e48\u0e27\u0e19\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14")) return "most_urgent";
  if (normalized.includes("\u0e14\u0e48\u0e27\u0e19")) return "urgent";
  return "normal";
}

function isDirectorNewBook(book: BookItem) {
  return (
    book.status === "clerk_review" ||
    book.status === "director_review" ||
    (book.tasks.length === 0 && book.status !== "done")
  );
}

function detailSpeedClass(value: string) {
  return styles["detailSpeed_" + urgencyFilterKey(value)] || styles.detailSpeed_normal;
}

type WorkflowStepKey = "not_started" | "assigned" | "acknowledged" | "done";

const workflowSteps: { key: WorkflowStepKey; symbol: string; label: string }[] = [
  { key: "not_started", symbol: "\u25cb", label: "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e40\u0e23\u0e34\u0e48\u0e21" },
  { key: "assigned", symbol: "\u25d4", label: "\u0e21\u0e2d\u0e1a\u0e2b\u0e21\u0e32\u0e22\u0e41\u0e25\u0e49\u0e27" },
  { key: "acknowledged", symbol: "\u25cf", label: "\u0e23\u0e31\u0e1a\u0e17\u0e23\u0e32\u0e1a\u0e41\u0e25\u0e49\u0e27" },
  { key: "done", symbol: "\u2713", label: "\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e2a\u0e34\u0e49\u0e19" },
];

function taskWorkflowStep(task?: TaskItem): WorkflowStepKey {
  if (!task) return "not_started";
  if (task.status === "done") return "done";
  if (task.status === "in_progress" || task.assignmentAcknowledgedAt) return "acknowledged";
  return "assigned";
}

function bookWorkflowStep(book: BookItem, currentUserId: string, personal: boolean): WorkflowStepKey {
  if (personal) {
    return taskWorkflowStep(book.tasks.find((task) => task.assigneeId === currentUserId));
  }

  if (book.status === "done") return "done";
  if (book.tasks.length === 0) return "not_started";
  if (book.tasks.every((task) => task.status === "done")) return "done";
  if (
    book.status === "in_progress" ||
    book.tasks.some(
      (task) => task.status === "in_progress" || task.status === "done" || task.assignmentAcknowledgedAt,
    )
  ) {
    return "acknowledged";
  }

  return "assigned";
}

function WorkTreeLine({
  book,
  currentUserId,
  personal,
}: {
  book: BookItem;
  currentUserId: string;
  personal: boolean;
}) {
  const currentStep = bookWorkflowStep(book, currentUserId, personal);
  const activeIndex = workflowSteps.findIndex((step) => step.key === currentStep);

  return (
    <div
      className={styles.workTreeLine}
      aria-label={"\u0e40\u0e2a\u0e49\u0e19\u0e17\u0e32\u0e07\u0e07\u0e32\u0e19 " + (workflowSteps[activeIndex]?.label || "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e40\u0e23\u0e34\u0e48\u0e21")}
    >
      {workflowSteps.map((step, index) => (
        <span
          key={step.key}
          className={[
            styles.workTreeStep,
            index <= activeIndex ? styles.workTreeStepActive : "",
            styles["workTreeStep_" + step.key] || "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={styles.workTreeSymbol}>{step.symbol}</span>
          <span className={styles.workTreeLabel}>{step.label}</span>
        </span>
      ))}
    </div>
  );
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
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [currentPage, setCurrentPage] = useState(1); // DOCUMENTS_PAGINATION_V10
  const [workAttentionFilter, setWorkAttentionFilter] =
    useState<WorkAttentionFilter>("all");
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
  const [selectedSmartAreaMode, setSelectedSmartAreaMode] = useState<"page" | "latest" | null>(null);
  const returnBookHandledRef = useRef(false);
  const deepLinkedBookHandledRef = useRef("");
  const keepSelectedBookOnFilterChangeRef = useRef(false);
  const mobileScrollYRef = useRef(0);
  const documentVersionRef = useRef(0);
  const documentChangeAtRef = useRef("");
  const documentCheckRunningRef = useRef(false);
  const hadSelectedBookRef = useRef(false);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [extensionInfo, setExtensionInfo] = useState<ExtensionInfo>({
    version: "1.8.32",
    downloadUrl:
      "https://drive.google.com/file/d/1Iwbi7jQNxGNHlvsrh-UjKxDoCO-zwIzf/view?usp=drive_link",
  });
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const isManagerWorkspace = capabilities.canAssign;
  const isClerkWorkspace = canManageAll && !capabilities.canAssign;
  const isMemberWorkspace = !canManageAll;

  function defaultDocumentViewMode(): ViewMode {
    return canManageAll ? "all" : "mine";
  }

  function clearCrossFilters() {
    setWorkAttentionFilter("all");
    setStatusFilter("all");
    setUrgencyFilter("all");
    setAssigneeFilter("all");
    setSelectedSmartAreaPage(null);
    setSelectedSmartAreaMode(null);
    setQuery("");
  }

  function activateLatestView() {
    setViewMode(defaultDocumentViewMode());
    clearCrossFilters();
  }

  function activateStatusView(nextStatus: string) {
    setViewMode(nextStatus === "done" ? "archive" : defaultDocumentViewMode());
    setStatusFilter(nextStatus === "done" ? "all" : nextStatus);
    setUrgencyFilter("all");
    setAssigneeFilter("all");
    setSelectedSmartAreaPage(null);
    setSelectedSmartAreaMode(null);
    setQuery("");
  }

  function activateWorkspaceView(nextViewMode: ViewMode) {
    setViewMode(nextViewMode);
    clearCrossFilters();
  }

  function activateWorkAttention(
    nextViewMode: ViewMode,
    nextFilter: WorkAttentionFilter,
  ) {
    setViewMode(nextViewMode);
    setWorkAttentionFilter(nextFilter);
    setStatusFilter("all");
    setUrgencyFilter("all");
    setAssigneeFilter("all");
    setSelectedSmartAreaPage(null);
    setSelectedSmartAreaMode(null);
    setQuery("");
  }

  function activateSmartAreaPage(
    pageNumber: number,
    mode: "page" | "latest" = "page",
  ) {
    setViewMode("all");
    setWorkAttentionFilter("all");
    setStatusFilter("all");
    setUrgencyFilter("all");
    setAssigneeFilter("all");
    setSelectedSmartAreaPage(pageNumber);
    setSelectedSmartAreaMode(mode);
    setQuery("");
  }

  function activateSearch(nextQuery: string) {
    setViewMode(defaultDocumentViewMode());
    setStatusFilter("all");
    setUrgencyFilter("all");
    setAssigneeFilter("all");
    setSelectedSmartAreaPage(null);
    setSelectedSmartAreaMode(null);
    setQuery(nextQuery);
  }

  function activateAssigneeFilter(nextAssigneeId: string) {
    setViewMode(defaultDocumentViewMode());
    setStatusFilter("all");
    setUrgencyFilter("all");
    setSelectedSmartAreaPage(null);
    setSelectedSmartAreaMode(null);
    setQuery("");
    setAssigneeFilter(nextAssigneeId);
  }

  function activateUrgencyFilter(nextUrgency: string) {
    setViewMode(defaultDocumentViewMode());
    setStatusFilter("all");
    setAssigneeFilter("all");
    setSelectedSmartAreaPage(null);
    setSelectedSmartAreaMode(null);
    setQuery("");
    setUrgencyFilter(nextUrgency);
  }

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

  useEffect(() => {
    if (typeof window === "undefined" || books.length === 0) return;

    const requestedBookId = new URLSearchParams(window.location.search).get(
      "book",
    );

    if (
      !requestedBookId ||
      deepLinkedBookHandledRef.current === requestedBookId
    ) {
      return;
    }

    const requestedBook = books.find((book) => book.id === requestedBookId);
    if (!requestedBook) return;

    deepLinkedBookHandledRef.current = requestedBookId;
    setSelectedBook(requestedBook);
  }, [books]);

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
              "https://drive.google.com/file/d/1Iwbi7jQNxGNHlvsrh-UjKxDoCO-zwIzf/view?usp=drive_link",
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
        const hasStarted = tasks.some(
          (task) => task.status === "in_progress" || task.status === "done",
        );

        return {
          ...book,
          tasks,
          status: allDone ? "done" : hasStarted ? "in_progress" : "assigned",
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
        note: "ปิดเรื่องเป็นเสร็จสิ้น",
      },
      `close:${book.id}`,
    );
  }


  function openAssignmentModal(book: BookItem) {
    setEditingBook(book);
    setSelectedAssigneeIds(
      book.tasks
        .map((task) => task.assigneeId)
        .filter((id): id is string => Boolean(id)),
    );
    setActionNote(book.directorNote || "");
    setMessage("");
    setSuccessMessage("");
  }
  async function saveAssignment() {
    if (!editingBook) return;

    if (selectedAssigneeIds.length === 0) {
      setMessage("\u0e01\u0e23\u0e38\u0e13\u0e32\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e04\u0e23\u0e39\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e19\u0e49\u0e2d\u0e22 1 \u0e04\u0e19");
      return;
    }

    if (!actionNote.trim()) {
      setMessage("\u0e01\u0e23\u0e38\u0e13\u0e32\u0e01\u0e23\u0e2d\u0e01\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e31\u0e48\u0e07\u0e01\u0e32\u0e23");
      return;
    }

    const ok = await postAction(
      {
        action: "assign",
        bookId: editingBook.id,
        assigneeIds: selectedAssigneeIds,
        note: actionNote.trim(),
      },
      `assign:${editingBook.id}`,
    );

    if (ok) {
      setEditingBook(null);
      setSelectedAssigneeIds([]);
      setActionNote("");
    }
  }

  const summary = useMemo(() => {
    const newBooks = books.filter(isDirectorNewBook).length;
    const assigned = books.filter((book) => book.status === "assigned").length;
    const inProgress = books.filter((book) => book.status === "in_progress").length;
    const done = books.filter((book) => book.status === "done").length;

    return {
      newBooks,
      assigned,
      inProgress,
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

  // DOCUMENTS_SCOPE_FILTER_PAGINATION_V1_5
  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");

    const result = books.filter((book) => {
      const ownTask = book.tasks.find(
        (task) => task.assigneeId === currentUserId,
      );
      const hasOwnTask = Boolean(ownTask);
      const isOwnDone = ownTask?.status === "done";
      const isArchivedBook = book.status === "done";

      const inSelectedView =
        selectedSmartAreaPage !== null
          ? true
          : viewMode === "all"
            ? true
            : viewMode === "archive"
              ? isMemberWorkspace
                ? Boolean(isOwnDone)
                : isArchivedBook
              : viewMode === "clerk" ||
                  viewMode === "director" ||
                  viewMode === "mine"
                ? hasOwnTask
                : true;

      if (!inSelectedView) return false;

      if (
        workAttentionFilter === "new" &&
        !(
          ownTask?.status === "assigned" &&
          !ownTask.assignmentOpenedAt &&
          !ownTask.assignmentAcknowledgedAt
        )
      ) {
        return false;
      }

      if (
        workAttentionFilter === "pending" &&
        (!ownTask || ownTask.status === "done")
      ) {
        return false;
      }

      if (statusFilter === "new" && !isDirectorNewBook(book)) {
        return false;
      }

      if (
        statusFilter !== "all" &&
        statusFilter !== "new" &&
        book.status !== statusFilter
      ) {
        return false;
      }

      if (
        urgencyFilter !== "all" &&
        urgencyFilterKey(book.urgency) !== urgencyFilter
      ) {
        return false;
      }

      if (
        assigneeFilter !== "all" &&
        !book.tasks.some((task) => task.assigneeId === assigneeFilter)
      ) {
        return false;
      }

      if (
        selectedSmartAreaPage !== null &&
        Number(book.smartAreaPage || 0) !== selectedSmartAreaPage
      ) {
        return false;
      }

      if (!normalizedQuery) return true;

      const searchableText = [
        book.registrationNumber,
        book.subject,
        book.sourceAgency,
        book.documentNumber,
        book.documentType,
        book.urgency,
        book.note,
        book.directorNote,
        ...book.tasks.map((task) => task.assigneeName),
      ]
        .join(" ")
        .toLocaleLowerCase("th");

      return searchableText.includes(normalizedQuery);
    });

    return [...result].sort((left, right) => {
      if (sortMode === "oldest") {
        return bookLatestValue(left) - bookLatestValue(right);
      }

      if (sortMode === "registration") {
        return (
          registrationValue(left.registrationNumber) -
            registrationValue(right.registrationNumber) ||
          bookLatestValue(right) - bookLatestValue(left)
        );
      }

      return bookLatestValue(right) - bookLatestValue(left);
    });
  }, [
    assigneeFilter,
    books,
    currentUserId,
    isMemberWorkspace,
    query,
    selectedSmartAreaMode,
    selectedSmartAreaPage,
    sortMode,
    statusFilter,
    urgencyFilter,
    viewMode,
    workAttentionFilter,
  ]);

  const DOCUMENTS_PER_PAGE = 20;
  const totalFilteredBooks = filteredBooks.length;
  const totalPages = Math.max(
    1,
    Math.ceil(totalFilteredBooks / DOCUMENTS_PER_PAGE),
  );
  const safeCurrentPage = Math.min(
    Math.max(currentPage, 1),
    totalPages,
  );
  const pageStartIndex = (safeCurrentPage - 1) * DOCUMENTS_PER_PAGE;
  const pageEndIndex = Math.min(
    pageStartIndex + DOCUMENTS_PER_PAGE,
    totalFilteredBooks,
  );
  const pagedBooks = filteredBooks.slice(pageStartIndex, pageEndIndex);

  // DOCUMENTS_RESOLVED_SOURCE_PAGES_V1_8
  const availableSmartAreaPages = useMemo(
    () =>
      Array.from(
        new Set(
          books
            .map((book) => Number(book.smartAreaPage || 0))
            .filter((value) => Number.isInteger(value) && value > 0),
        ),
      ).sort((left, right) => left - right),
    [books],
  );

  const latestSmartAreaPage =
    availableSmartAreaPages[availableSmartAreaPages.length - 1] ?? null;

  const visibleSmartAreaPages = useMemo(() => {
    if (latestSmartAreaPage === null) return [];

    return [latestSmartAreaPage - 2, latestSmartAreaPage - 1, latestSmartAreaPage]
      .filter((pageNumber) => pageNumber > 0);
  }, [latestSmartAreaPage]);
  useEffect(() => {
    setCurrentPage(1);
  }, [
    assigneeFilter,
    query,
    selectedSmartAreaPage,
    sortMode,
    statusFilter,
    urgencyFilter,
    viewMode,
    workAttentionFilter,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function changeDocumentPage(nextPage: number) {
    const boundedPage = Math.min(Math.max(nextPage, 1), totalPages);
    setCurrentPage(boundedPage);

    window.requestAnimationFrame(() => {
      document
        .querySelector('[data-documents-list-start="true"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const workspaceCounts = useMemo(() => {
    const ownBooks = books.filter((book) =>
      book.tasks.some((task) => task.assigneeId === currentUserId),
    );

    const ownDoneBooks = ownBooks.filter((book) =>
      book.tasks.some(
        (task) =>
          task.assigneeId === currentUserId &&
          task.status === "done",
      ),
    );

    const ownNewBooks = ownBooks.filter((book) =>
      book.tasks.some(
        (task) =>
          task.assigneeId === currentUserId &&
          task.status === "assigned" &&
          !task.assignmentOpenedAt &&
          !task.assignmentAcknowledgedAt,
      ),
    );

    const globalDoneBooks = books.filter(
      (book) => book.status === "done",
    );

    return {
      all: books.length,
      own: ownBooks.length,
      ownNew: ownNewBooks.length,
      ownDone: ownDoneBooks.length,
      archive: isMemberWorkspace
        ? ownDoneBooks.length
        : globalDoneBooks.length,
    };
  }, [books, currentUserId, isMemberWorkspace]);

  function NewWorkBadge({ count }: { count: number }) {
    if (count <= 0) return null;

    return (
      <sup
        className={styles.newWorkBadge}
        aria-label={`งานใหม่ ${count} งาน`}
        title={`งานใหม่ ${count} งาน`}
      >
        {count}
      </sup>
    );
  }

  useEffect(() => {
    if (keepSelectedBookOnFilterChangeRef.current) {
      keepSelectedBookOnFilterChangeRef.current = false;
      return;
    }

    setSelectedBook(null);
  }, [
    assigneeFilter,
    query,
    selectedSmartAreaMode,
    selectedSmartAreaPage,
    statusFilter,
    urgencyFilter,
    viewMode,
    workAttentionFilter,
  ]);


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
      setSelectedSmartAreaMode("page");
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
      <SmartAreaImportButton />
      <section className={styles.summaryGrid}>
        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryAll}`}
          onClick={() => activateStatusView("new")}
        >
          <span className={styles.summaryIcon}>▤</span>
          <span>
            <small>{"\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d\u0e43\u0e2b\u0e21\u0e48"}</small>
            <strong>{summary.newBooks}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryPending}`}
          onClick={() => activateStatusView("assigned")}
        >
          <span className={styles.summaryIcon}>◉</span>
          <span>
            <small>มอบหมายแล้ว</small>
            <strong>{summary.assigned}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryProgress}`}
          onClick={() => activateStatusView("in_progress")}
        >
          <span className={styles.summaryIcon}>◷</span>
          <span>
            <small>กำลังดำเนินการ</small>
            <strong>{summary.inProgress}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryDone}`}
          onClick={() => activateStatusView("done")}
        >
          <span className={styles.summaryIcon}>✓</span>
          <span>
            <small>{"\u0e40\u0e2a\u0e23\u0e47\u0e08\u0e2a\u0e34\u0e49\u0e19"}</small>
            <strong>{summary.done}</strong>
          </span>
        </button>
      </section>

      <section
        className={`${styles.workspace} ${
          workloadCollapsed ? styles.workspaceCollapsed : ""
        }`}
      >
        <div className={styles.mainPanel} data-documents-list-start="true">
          <div className={`${styles.viewTabs} ${styles.documentsMobileScopeV1}`}>
            {!isMemberWorkspace && (
              <button
                type="button"
                className={[
                  styles.scopeTab,
                  selectedSmartAreaMode === null && viewMode === "all"
                    ? styles.activeTab
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => activateWorkspaceView("all")}
                aria-pressed={selectedSmartAreaMode === null && viewMode === "all"}
              >
                <span>งานทั้งหมด</span>
                <strong>{workspaceCounts.all}</strong>
              </button>
            )}

            <button
              type="button"
              className={[
                styles.scopeTab,
                styles.personalScopeTab,
                selectedSmartAreaMode === null &&
                viewMode === (isManagerWorkspace ? "director" : "mine")
                  ? styles.activeTab
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() =>
                activateWorkspaceView(
                  isManagerWorkspace ? "director" : "mine",
                )
              }
              aria-pressed={
                selectedSmartAreaMode === null &&
                viewMode === (isManagerWorkspace ? "director" : "mine")
              }
            >
              <span>
                {isManagerWorkspace ? "งาน ผอ." : "งานของฉัน"}
              </span>
              <strong>{workspaceCounts.own}</strong>
              <NewWorkBadge count={workspaceCounts.ownNew} />
            </button>

            <button
              type="button"
              className={[
                styles.scopeTab,
                styles.doneScopeTab,
                selectedSmartAreaMode === null && viewMode === "archive"
                  ? styles.activeTab
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => activateWorkspaceView("archive")}
              aria-pressed={selectedSmartAreaMode === null && viewMode === "archive"}
            >
              <span>งานที่เสร็จแล้ว</span>
              <strong>{workspaceCounts.archive}</strong>
            </button>
          </div>

          <div className={`${styles.toolbar} ${styles.documentsMobileFiltersV1}`}>
            <label className={styles.searchField}>
              <span>ค้นหา</span>
              <span className={styles.searchIcon} aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(event) => activateSearch(event.target.value)}
                placeholder="ค้นหาเรื่อง เลขรับ หน่วยงาน ผู้รับผิดชอบ..."
              />
            </label>

            <label className={styles.selectField}>
              <span>สถานะ</span>
              <select
                value={statusFilter}
                onChange={(event) => activateStatusView(event.target.value)}
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
              <span>{"\u0e0a\u0e31\u0e49\u0e19\u0e04\u0e27\u0e32\u0e21\u0e40\u0e23\u0e47\u0e27"}</span>
              <select
                value={urgencyFilter}
                onChange={(event) => activateUrgencyFilter(event.target.value)}
              >
                <option value="all">{"\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14"}</option>
                <option value="normal">{"\u0e1b\u0e01\u0e15\u0e34"}</option>
                <option value="urgent">{"\u0e14\u0e48\u0e27\u0e19"}</option>
                <option value="most_urgent">{"\u0e14\u0e48\u0e27\u0e19\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14"}</option>
              </select>
            </label>
          <label className={styles.selectField}>
            <span>ผู้รับผิดชอบ</span>
            <select
              value={assigneeFilter}
              onChange={(event) => activateAssigneeFilter(event.target.value)}
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

          <div className={`${styles.resultBar} ${styles.documentsMobilePagerV1}`}>
            <div className={`${styles.resultSummary} ${styles.documentsMobileSummaryV1}`}>
              <strong>
                {selectedSmartAreaMode !== null && selectedSmartAreaPage !== null
                  ? `หน้าระบบกลาง ${selectedSmartAreaPage}`
                  : viewMode === "clerk"
                    ? "งานธุรการ"
                    : viewMode === "director"
                      ? "งาน ผอ."
                      : viewMode === "mine"
                        ? "งานของฉัน"
                        : viewMode === "all"
                          ? "งานทั้งหมด"
                          : "งานที่เสร็จแล้ว"}
              </strong>
              <span>
                {totalFilteredBooks === 0 ? 0 : pageStartIndex + 1}–{pageEndIndex} จาก {totalFilteredBooks} รายการ
              </span>
            </div>

            {totalFilteredBooks > 0 && (
              <nav className={`${styles.documentPagerTop} ${styles.documentsMobileDocumentPagerV1}`} aria-label="เปลี่ยนหน้ารายการหนังสือ">
                <button
                  type="button"
                  className={styles.documentPagerArrow}
                  onClick={() => changeDocumentPage(safeCurrentPage - 1)}
                  disabled={safeCurrentPage <= 1}
                  aria-label="หน้าก่อนหน้า"
                >
                  &lt;
                </button>
                <span className={styles.documentPagerLabel}>
                  หน้า {safeCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  className={styles.documentPagerArrow}
                  onClick={() => changeDocumentPage(safeCurrentPage + 1)}
                  disabled={safeCurrentPage >= totalPages}
                  aria-label="หน้าถัดไป"
                >
                  &gt;
                </button>
              </nav>
            )}

            {!isMemberWorkspace && (
              <div className={`${styles.pagination} ${styles.documentsMobileSourcePagesV1}`}>

                {visibleSmartAreaPages.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={
                      selectedSmartAreaMode === "page" &&
                      pageNumber === selectedSmartAreaPage
                        ? styles.activeSourcePage
                        : ""
                    }
                    onClick={() => activateSmartAreaPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}


                <button
                  type="button"
                  className={`${styles.latestSourcePage} ${
                    selectedSmartAreaMode === "latest" ? styles.activeSourcePage : ""
                  }`}
                  onClick={() => {
                    if (latestSmartAreaPage !== null) {
                      activateSmartAreaPage(latestSmartAreaPage, "latest");
                    } else {
                      activateLatestView();
                    }
                  }}
                  disabled={latestSmartAreaPage === null && books.length === 0}
                >
                  ล่าสุด
                </button>
              </div>
            )}
          </div>


          {/* SMART AREA MOBILE V5.3 START */}
          <div className={styles.mobileDocumentList}>
            {pagedBooks.map((book) => {
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
                  <DocumentListDate book={book} />

                  <div className={styles.mobileMetaGrid}>
                    <div>
                      <span>{"\u0e40\u0e25\u0e02\u0e23\u0e31\u0e1a"}</span>
                      <strong>{book.registrationNumber || "-"}</strong>
                    </div>
                    <div>
                      <span>{"\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d"}</span>
                      <strong>{book.documentNumber || "-"}</strong>
                    </div>
                    <div>
                      <span>{"\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e23\u0e31\u0e1a"}</span>
                      <strong>{formatDate(book.receivedDate)}</strong>
                    </div>
                    <div>
                      <span>{"\u0e25\u0e07\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48"}</span>
                      <strong>{formatDate(book.documentDate)}</strong>
                    </div>
                    <div>
                      <span>จาก</span>
                      <strong>{source.group || source.name}</strong>
                    </div>
                    <div>
                      <span>ผู้รับผิดชอบ</span>
                      <strong><AssigneeStatusNames tasks={book.tasks} /></strong>
                    </div>
                  </div>

                  <div className={`${styles.mobileFiles} ${book.status === "done" ? styles.hiddenListAttachments : ""}`}>
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
                      book.status !== "done" &&
                      book.tasks.length === 0 && (
                        <button
                          type="button"
                          className={`${styles.doneAction} ${styles.mobileFinishButton}`}
                          onClick={() => closeBookAsDone(book)}
                          disabled={savingKey === `close:${book.id}`}
                        >
                          เสร็จสิ้น
                        </button>
                      )}

                    {workspaceMode === "clerk" &&
                      book.status === "clerk_review" && (
                        <div className={styles.clerkQuickActions}>
                          {capabilities.canClose && book.tasks.length === 0 && (
                            <button
                              type="button"
                              className={styles.clerkDoneCompact}
                              onClick={() => closeBookAsDone(book)}
                              disabled={savingKey === `close:${book.id}`}
                            >
                              เสร็จสิ้น
                            </button>
                          )}

                          {capabilities.canSubmit && (
                            <button
                              type="button"
                              className={styles.clerkSubmitCompact}
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
                        </div>
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

                            <div className={styles.mobileDetailWorkflow}>
                              <WorkTreeLine
                              book={book}
                              currentUserId={currentUserId}
                              personal={viewMode === "mine" || viewMode === "director" || !canManageAll}
                            />
                            </div>
                          </div>

                          <div className={styles.mobileDetailGrid}>
                            <section className={styles.detailNumberField}>
                              <span>{"\u0e40\u0e25\u0e02\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e23\u0e31\u0e1a"}</span>
                              <strong className={styles.detailPlainValue}>
                                {book.registrationNumber || "-"}
                              </strong>
                            </section>
                            <section className={styles.detailNumberField}>
                              <span>{"\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d"}</span>
                              <strong className={styles.detailPlainValue}>{book.documentNumber || "-"}</strong>
                            </section>
                            <section className={styles.detailDateField}>
                              <span>{"\u0e25\u0e07\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48"}</span>
                              <strong className={styles.detailPlainValue}>
                                {formatDate(book.documentDate)}
                              </strong>
                            </section>
                            <section className={styles.detailDateField}>
                              <span>{"\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e23\u0e31\u0e1a"}</span>
                              <strong className={styles.detailPlainValue}>{formatDate(book.receivedDate)}</strong>
                            </section>
                            <section>
                              <span>{"\u0e0a\u0e31\u0e49\u0e19\u0e04\u0e27\u0e32\u0e21\u0e40\u0e23\u0e47\u0e27"}</span>
                              <strong className={detailSpeedClass(book.urgency)}>
                                {book.urgency || "\u0e1b\u0e01\u0e15\u0e34"}
                              </strong>
                            </section>
                            <section className={styles.mobileDetailWide}>
                              <span>{"\u0e08\u0e32\u0e01"}</span>
                              <strong>{source.name}</strong>
                              {source.group && <small>{source.group}</small>}
                            </section>
                            <section className={styles.mobileDetailWide}>
                              <span>{"\u0e1c\u0e39\u0e49\u0e23\u0e31\u0e1a\u0e1c\u0e34\u0e14\u0e0a\u0e2d\u0e1a"}</span>
                              <strong>
                                <AssigneeStatusNames tasks={book.tasks} />
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

                          <section className={`${styles.mobileDetailText} ${styles.directorInstruction}`}>
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
                                className={`${styles.assignDetailButton} ${styles.assignAction}`}
                                onClick={() => openAssignmentModal(book)}
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
                                      note: "ปิดเรื่องเป็นเสร็จสิ้น",
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
                {pagedBooks.map((book) => (
                  <Fragment key={book.id}>
                  <tr
                    id={`book-${book.id}`}
                    className={`${selectedBook?.id === book.id ? styles.selectedRow : ""} ${
                      book.status === "done" ? styles.completedCompactRow : ""
                    }`}
                  >
                    <td data-label="ลำดับ">
                      <div className={styles.registrationCell}>
<strong>{book.registrationNumber || "-"}</strong>
                        <small className={styles.documentNumber}>
                          {book.documentNumber || "-"}
                        </small>
                        <DocumentListDate book={book} />
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
                        <div className={`${styles.fileLinks} ${book.status === "done" ? styles.hiddenListAttachments : ""}`}>
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
                            <span className={styles.sourceGroupOnly}>
                              {source.group || source.name}
                            </span>
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
                        <AssigneeStatusNames tasks={book.tasks} />
                      </div>
                    </td>

                    <td data-label="จัดการ">
                      <div className={styles.actionCell}>
                        {workspaceMode === "clerk" &&
                          book.status === "clerk_review" && (
                            <div className={styles.clerkQuickActions}>
                              {capabilities.canClose &&
                                book.tasks.length === 0 && (
                                  <button
                                    type="button"
                                    className={styles.clerkDoneCompact}
                                    onClick={() => closeBookAsDone(book)}
                                    disabled={savingKey === `close:${book.id}`}
                                  >
                                    เสร็จสิ้น
                                  </button>
                                )}

                              {capabilities.canSubmit && (
                                <button
                                  type="button"
                                  className={styles.clerkSubmitCompact}
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
                            </div>
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
                            <div className={styles.inlineDetailWorkflow}>
                              <WorkTreeLine
                              book={book}
                              currentUserId={currentUserId}
                              personal={viewMode === "mine" || viewMode === "director" || !canManageAll}
                            />
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
                                    className={`${styles.assignDetailButton} ${styles.assignAction}`}
                                    onClick={() => openAssignmentModal(book)}
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
                            <div className={styles.detailNumberField}>
                              <span>{"\u0e40\u0e25\u0e02\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e23\u0e31\u0e1a"}</span>
                              <strong className={styles.detailPlainValue}>{book.registrationNumber || "-"}</strong>
                            </div>
                            <div className={styles.detailNumberField}>
                              <span>{"\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e2b\u0e19\u0e31\u0e07\u0e2a\u0e37\u0e2d"}</span>
                              <strong className={styles.detailPlainValue}>{book.documentNumber || "-"}</strong>
                            </div>
                            <div className={styles.detailDateField}>
                              <span>{"\u0e25\u0e07\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48"}</span>
                              <strong className={styles.detailPlainValue}>{formatDate(book.documentDate)}</strong>
                            </div>
                            <div className={styles.detailDateField}>
                              <span>{"\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48\u0e23\u0e31\u0e1a"}</span>
                              <strong className={styles.detailPlainValue}>{formatDate(book.receivedDate)}</strong>
                            </div>
                            <div>
                              <span>{"\u0e08\u0e32\u0e01\u0e2b\u0e19\u0e48\u0e27\u0e22\u0e07\u0e32\u0e19"}</span>
                              <strong>{book.sourceAgency || "-"}</strong>
                            </div>
                            <div>
                              <span>{"\u0e1b\u0e23\u0e30\u0e40\u0e20\u0e17 / \u0e0a\u0e31\u0e49\u0e19\u0e04\u0e27\u0e32\u0e21\u0e40\u0e23\u0e47\u0e27"}</span>
                              <strong className={detailSpeedClass(book.urgency)}>
                                {[book.documentType, book.urgency]
                                  .filter(Boolean)
                                  .join(" \u00b7 ") || "-"}
                              </strong>
                            </div>
                          </div>

                          <div className={styles.inlineDetailSections}>
                            <div>
                              <span>หมายเหตุ</span>
                              <p>{book.note || "-"}</p>
                            </div>
                            <div className={styles.directorInstruction}>
                              <span>ข้อความสั่งการ</span>
                              <p>{book.directorNote || "-"}</p>
                            </div>
                            <div>
                              <span>{"\u0e1c\u0e39\u0e49\u0e23\u0e31\u0e1a\u0e1c\u0e34\u0e14\u0e0a\u0e2d\u0e1a"}</span>
                              <p>
                                <AssigneeStatusNames tasks={book.tasks} />
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
                    activateAssigneeFilter(
                      assigneeFilter === item.id ? "all" : item.id,
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
                <p>
                  {editingBook.tasks.length > 0
                    ? "\u0e41\u0e01\u0e49\u0e44\u0e02\u0e1c\u0e39\u0e49\u0e23\u0e31\u0e1a\u0e21\u0e2d\u0e1a\u0e2b\u0e21\u0e32\u0e22"
                    : "\u0e21\u0e2d\u0e1a\u0e2b\u0e21\u0e32\u0e22\u0e42\u0e14\u0e22\u0e44\u0e21\u0e48\u0e25\u0e07\u0e19\u0e32\u0e21"}
                </p>
                <h2>{editingBook.subject}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingBook(null)}
                aria-label={"\u0e1b\u0e34\u0e14\u0e2b\u0e19\u0e49\u0e32\u0e15\u0e48\u0e32\u0e07\u0e21\u0e2d\u0e1a\u0e2b\u0e21\u0e32\u0e22"}
                title={"\u0e1b\u0e34\u0e14"}
              >
                {"\u00d7"}
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
                {savingKey.startsWith("assign:")
                  ? "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e2a\u0e48\u0e07..."
                  : "\u0e2a\u0e48\u0e07"}
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
