Student attendance phase 1.2 was installed.

New route:
- /students/settings

New files:
- app/students/settings/page.tsx
- app/api/students/settings/route.ts
- components/students/StudentWorkPermissionsSection.tsx
- lib/students/settings.ts
- supabase/migrations/20260709_student_attendance_phase12_permissions.sql

Manual step if needed:
- Add the StudentWorkPermissionsSection component to the existing member edit screen.