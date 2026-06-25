แก้ TypeScript error ของ SupabaseClient generic

ไฟล์ที่ต้องแทน:
app/api/admin/attendance/daily-pdf/route.ts

สาเหตุ:
ส่ง adminClient ข้ามฟังก์ชัน ทำให้ TypeScript อนุมาน generic คนละชนิด

วิธีแก้:
ให้ buildDailyPdf() สร้าง Supabase admin client ภายในฟังก์ชันเอง

ติดตั้ง:
cd $HOME\Downloads

Expand-Archive `
  -Path ".\work-attendance-daily-pdf-build-type-fix.zip" `
  -DestinationPath "D:\work-attendance-system" `
  -Force

cd D:\work-attendance-system
npm run build
