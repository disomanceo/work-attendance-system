import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase/client";

export type TeachingInspectionStatus = "draft" | "completed";

export type TeachingInspectionImage = {
  slot: 1 | 2 | 3 | 4;
  category: string;
  caption: string;
  fileName: string;
  mimeType: string;
  size: number;
  driveFileId?: string;
  driveFolderId?: string;
  driveUrl?: string;
  uploadedAt?: string;
};

export type TeachingInspectionPdfReport = {
  driveFileId: string;
  driveFolderId: string;
  driveUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt?: string;
};

export type TeachingInspectionPayload = {
  teacherId: string;
  teacherName: string;
  teacherType: "homeroom" | "subject";
  inspectionRound?: number;
  learningAreaName: string;
  subjectName: string;
  classLevelName: string;
  inspectionDate: string;
  startTime: string;
  endTime: string;
  supervisorId: string;
  supervisorName: string;
  coSupervisorId: string | null;
  coSupervisorName: string | null;
  learningMethod: string;
  academicYearBE: number;
  semester: number;
  status: TeachingInspectionStatus;
  sections: Array<{
    sectionId: string;
    sectionName: string;
    fullScore: number;
    earnedScore: number;
    rawScore: number;
    rawFullScore: number;
    averageRating: number;
    percentage: number;
    qualityLevel: string;
    completedItems: number;
    totalItems: number;
    items: Array<{
      itemId: string;
      itemNumber: string;
      title: string;
      rating: 1 | 2 | 3 | 4 | 5 | null;
      weightedScore: number;
    }>;
  }>;
  totalEarnedScore: number;
  totalFullScore: 100;
  totalPercentage: number;
  averageRating: number;
  qualityLevel: string;
  strengths: string;
  improvements: string;
  recommendations: string;
  developmentAgreement: string;
  followUpDate: string | null;
  images: TeachingInspectionImage[];
  pdfReport?: TeachingInspectionPdfReport | null;
  createdBy: string;
  updatedBy: string;
};

export type TeachingInspectionRecord = TeachingInspectionPayload & {
  id: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type TeachingInspectionRoundPlanInput = {
  academicYearBE: number;
  semester: number;
  inspectionRound: number;
  teacherIds: string[];
  createdBy: string;
  updatedBy: string;
};

export type TeachingInspectionRoundPlanRecord = TeachingInspectionRoundPlanInput & {
  id: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const COLLECTION_NAME = "teaching_inspections";
const ROUND_PLAN_COLLECTION_NAME = "teaching_supervision_round_plans";

export function isTeachingInspectionFirebaseConfigured() {
  return isFirebaseConfigured();
}

export async function saveTeachingInspection(
  inspectionId: string,
  input: TeachingInspectionPayload,
  createIfMissing = false,
) {
  const client = getFirebaseClient();
  if (!client) throw new Error("Firebase is not configured");

  if (inspectionId) {
    if (createIfMissing) {
      await setDoc(
        doc(client.db, COLLECTION_NAME, inspectionId),
        {
          ...input,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return inspectionId;
    }

    await updateDoc(doc(client.db, COLLECTION_NAME, inspectionId), {
      ...input,
      updatedAt: serverTimestamp(),
    });
    return inspectionId;
  }

  const reference = await addDoc(collection(client.db, COLLECTION_NAME), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return reference.id;
}

export async function listTeachingInspections() {
  const client = getFirebaseClient();
  if (!client) throw new Error("Firebase is not configured");

  const snapshot = await getDocs(collection(client.db, COLLECTION_NAME));
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })) as TeachingInspectionRecord[];
}

export async function listTeachingInspectionRoundPlans() {
  const client = getFirebaseClient();
  if (!client) throw new Error("Firebase is not configured");

  const snapshot = await getDocs(collection(client.db, ROUND_PLAN_COLLECTION_NAME));
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  })) as TeachingInspectionRoundPlanRecord[];
}

export async function saveTeachingInspectionRoundPlan(
  input: TeachingInspectionRoundPlanInput,
) {
  const client = getFirebaseClient();
  if (!client) throw new Error("Firebase is not configured");

  const id = [
    "year",
    input.academicYearBE,
    "semester",
    input.semester,
    "round",
    input.inspectionRound,
  ].join("-");

  await setDoc(
    doc(client.db, ROUND_PLAN_COLLECTION_NAME, id),
    {
      ...input,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return id;
}

export async function updateTeachingInspectionPdfReport(
  inspectionId: string,
  pdfReport: TeachingInspectionPdfReport,
) {
  const client = getFirebaseClient();
  if (!client) throw new Error("Firebase is not configured");

  await updateDoc(doc(client.db, COLLECTION_NAME, inspectionId), {
    pdfReport,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTeachingInspection(inspectionId: string) {
  const client = getFirebaseClient();
  if (!client) throw new Error("Firebase is not configured");

  await deleteDoc(doc(client.db, COLLECTION_NAME, inspectionId));
}
