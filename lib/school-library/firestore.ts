import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  normalizeSchoolLibraryCategory,
  type SchoolLibraryCategory,
} from "@/lib/school-library/categories";

export type SchoolLibraryStatus = "reviewed" | "approved" | "draft" | "ready";

export type SchoolLibraryFileType = "PDF" | "DOCX" | "DRIVE";

export type SchoolLibraryDocumentFile = {
  driveUrl: string;
  driveFileId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  fileType: SchoolLibraryFileType;
};

export type SchoolLibraryDocument = {
  id: string;
  title: string;
  category: SchoolLibraryCategory;
  subcategory: string;
  owner: string;
  gradeLevel: string;
  subject: string;
  academicYear: string;
  fileType: SchoolLibraryFileType;
  status: SchoolLibraryStatus;
  updatedAt: string;
  keywords: string[];
  driveUrl: string;
  driveFileId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  files?: SchoolLibraryDocumentFile[];
  uploadedByUserId?: string;
  uploadedByName?: string;
};

export type NewSchoolLibraryDocument = Omit<SchoolLibraryDocument, "id" | "updatedAt">;

const COLLECTION_NAME = "schoolLibraryDocuments";

function formatUpdatedAt(value: unknown) {
  if (value instanceof Timestamp) {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(value.toDate());
  }

  if (typeof value === "string" && value.trim()) return value;
  return "วันนี้";
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arrayText(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
}

function mapFile(value: unknown): SchoolLibraryDocumentFile | null {
  if (!value || typeof value !== "object") return null;

  const data = value as Record<string, unknown>;
  const driveUrl = text(data.driveUrl);
  const driveFileId = text(data.driveFileId);
  const fileName = text(data.fileName);
  if (!driveUrl && !driveFileId && !fileName) return null;

  return {
    driveUrl,
    driveFileId,
    fileName,
    mimeType: text(data.mimeType),
    fileSize: typeof data.fileSize === "number" ? data.fileSize : undefined,
    fileType: text(data.fileType, "DRIVE") as SchoolLibraryFileType,
  };
}

function arrayFiles(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => mapFile(item))
        .filter((item): item is SchoolLibraryDocumentFile => Boolean(item))
    : [];
}

function mapDocument(id: string, data: Record<string, unknown>): SchoolLibraryDocument {
  const files = arrayFiles(data.files);

  return {
    id,
    title: text(data.title, "ไม่มีชื่อเอกสาร"),
    category: normalizeSchoolLibraryCategory(data.category),
    subcategory: text(data.subcategory, "เอกสารทั่วไป"),
    owner: text(data.owner, "ไม่ระบุผู้จัดทำ"),
    gradeLevel: text(data.gradeLevel, "ทั้งโรงเรียน"),
    subject: text(data.subject, "-"),
    academicYear: text(data.academicYear, "2569"),
    fileType: text(data.fileType, "DRIVE") as SchoolLibraryFileType,
    status: text(data.status, "ready") as SchoolLibraryStatus,
    updatedAt: formatUpdatedAt(data.updatedAt),
    keywords: arrayText(data.keywords),
    driveUrl: text(data.driveUrl),
    driveFileId: text(data.driveFileId),
    fileName: text(data.fileName),
    mimeType: text(data.mimeType),
    fileSize: typeof data.fileSize === "number" ? data.fileSize : undefined,
    files,
    uploadedByUserId: text(data.uploadedByUserId),
    uploadedByName: text(data.uploadedByName),
  };
}

export function isSchoolLibraryFirebaseConfigured() {
  return isFirebaseConfigured();
}

export async function listSchoolLibraryDocuments() {
  const client = getFirebaseClient();
  if (!client) return [];

  const documentsQuery = query(
    collection(client.db, COLLECTION_NAME),
    orderBy("updatedAt", "desc"),
  );
  const snapshot = await getDocs(documentsQuery);

  return snapshot.docs.map((item) => mapDocument(item.id, item.data()));
}

export async function createSchoolLibraryDocument(input: NewSchoolLibraryDocument) {
  const client = getFirebaseClient();
  if (!client) throw new Error("Firebase is not configured");

  const payload = {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const reference = await addDoc(collection(client.db, COLLECTION_NAME), payload);

  return {
    ...input,
    id: reference.id,
    updatedAt: "วันนี้",
  };
}

export async function updateSchoolLibraryDocument(
  documentId: string,
  input: NewSchoolLibraryDocument,
) {
  const client = getFirebaseClient();
  if (!client) throw new Error("Firebase is not configured");

  await updateDoc(doc(client.db, COLLECTION_NAME, documentId), {
    ...input,
    updatedAt: serverTimestamp(),
  });

  return {
    ...input,
    id: documentId,
    updatedAt: "วันนี้",
  };
}

export async function deleteSchoolLibraryDocument(documentId: string) {
  const client = getFirebaseClient();
  if (!client) throw new Error("Firebase is not configured");

  await deleteDoc(doc(client.db, COLLECTION_NAME, documentId));
}
