เพิ่มปุ่มลบ PDF รายวัน

ฟังก์ชัน:
- แสดง “ลบ PDF วันนี้” เมื่อเลือกโหมดรายวัน
- กดได้เฉพาะวันที่มี PDF จริง
- มีกล่องยืนยันก่อนลบ
- ย้ายไฟล์ไปถังขยะ Google Drive ไม่ได้ลบถาวร
- หลังลบ:
  - Preview หายทันที
  - ปุ่มวันเปลี่ยนจากสีเขียวเป็นสีเทา
  - สามารถสร้าง PDF วันนั้นใหม่ภายหลังได้
- ถ้าปิดเดือนแล้ว จะไม่อนุญาตให้ลบ PDF รายวัน

ไฟล์ที่แก้:
1. app/admin/attendance/page.tsx
2. app/admin/attendance/attendance-report.module.css
3. app/api/admin/attendance/daily-pdf/route.ts
4. gas/Code.gs

ติดตั้ง:
cd $HOME\Downloads

Expand-Archive `
  -Path ".\work-attendance-daily-pdf-delete.zip" `
  -DestinationPath "D:\work-attendance-system" `
  -Force

cd D:\work-attendance-system
npm run build
npm run dev

อัปเดต GAS:
- แทน Code.gs ด้วยไฟล์ gas/Code.gs
- Save
- Deploy > Manage deployments > Edit > New version > Deploy

ไม่ต้องเปลี่ยน .env.local
