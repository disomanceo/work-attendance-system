export type TrainingReportStatus = "draft" | "submitted" | "not_attended";

export type TrainingReportMode = "individual" | "group";

export type TrainingReportSource = "assigned" | "manual";

export type TrainingReportAttachment = {
  fileId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  attachmentKind?: "pdf" | "photo" | "file";
  slotIndex?: number;
  slotKey?: string;
  slotLabel?: string;
};

export type TrainingReport = {
  id: string;
  status: TrainingReportStatus;
  mode: TrainingReportMode;
  reportSource: TrainingReportSource;
  sourceDocumentId: string;
  sourceAssignmentId: string;
  bookNumber: string;
  documentTitle: string;
  teacherProfileId: string;
  teacherNameSnapshot: string;
  buddhistYear: number;
  trainingType: string;
  trainingStartDate: string;
  trainingEndDate: string;
  dueDate: string;
  hours: number;
  place: string;
  organizer: string;
  objectives: string;
  summary: string;
  benefits: string;
  application: string;
  suggestions: string;
  attachments: TrainingReportAttachment[];
  submittedAt: string | null;
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
};

export type TrainingReportSourceTask = {
  taskId: string;
  bookId: string;
  assigneeId: string;
  assigneeName: string;
  assigneeImageFileId?: string;
  status: string;
  requiresTrainingReport: boolean;
  assignmentNote: string;
  registrationNumber: string;
  documentNumber: string;
  subject: string;
  documentDate: string;
  receivedDate: string;
};
