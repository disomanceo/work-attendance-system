export const STUDENT_CLASS_LEVELS = [
  "อนุบาล 2",
  "อนุบาล 3",
  "ป.1",
  "ป.2",
  "ป.3",
  "ป.4",
  "ป.5",
  "ป.6",
] as const;

export const STUDENT_WORK_PERMISSION_KEY_VALUES = [
  "manage_student_settings",
  "manage_class_advisers",
  "manage_duty_roster",
  "view_duty_roster",
  "student_attendance_all_classes",
] as const;

export const STUDENT_WORK_PERMISSION_KEYS = {
  studentSettingsManager: "manage_student_settings",
  classAdviser: "manage_class_advisers",
  dutyRosterManager: "manage_duty_roster",
  dutyRosterViewer: "view_duty_roster",
  allClassRecorder: "student_attendance_all_classes",
} as const;

export type StudentClassLevel = (typeof STUDENT_CLASS_LEVELS)[number];
export type StudentWorkPermissionKey =
  (typeof STUDENT_WORK_PERMISSION_KEY_VALUES)[number];

export const STUDENT_WORK_PERMISSION_LABELS: Record<StudentWorkPermissionKey, string> = {
  manage_student_settings: "จัดการตั้งค่างานนักเรียน",
  manage_class_advisers: "แต่งตั้งครูประจำชั้น",
  manage_duty_roster: "แต่งตั้งครูเวรประจำวัน",
  view_duty_roster: "ดูตารางเวรประจำวัน",
  student_attendance_all_classes: "กรอกเช็คชื่อได้ทุกห้อง",
};

export function isStudentClassLevel(value: string): value is StudentClassLevel {
  return (STUDENT_CLASS_LEVELS as readonly string[]).includes(value);
}

export function isStudentWorkPermissionKey(
  value: string
): value is StudentWorkPermissionKey {
  return (STUDENT_WORK_PERMISSION_KEY_VALUES as readonly string[]).includes(value);
}