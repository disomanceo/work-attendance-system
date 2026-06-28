/**
 * เพิ่มในไฟล์ที่จัดการ action leaveCreatePending
 * จุดประสงค์: GAS ห้ามรันเลขใบลาเอง ให้ใช้เลขที่ Next.js/Supabase ส่งมาเท่านั้น
 */

function requireDocumentNumber_(payload) {
  var value = String(payload.documentNumber || '').trim();
  if (!value) {
    throw new Error('ไม่พบ documentNumber จากระบบหลัก');
  }
  return value;
}

/*
ตัวอย่างภายในฟังก์ชัน leaveCreatePending เดิม:

function leaveCreatePending_(payload) {
  var leaveNumber = requireDocumentNumber_(payload);

  // เดิมอาจเป็น:
  // var leaveNumber = getNextLeaveNumber_(...);
  // ให้ยกเลิกการเรียกฟังก์ชันรันเลขเดิม

  // นำ leaveNumber ไป replace placeholder ใน Docs เช่น:
  replaceAllText_(body, '{{LEAVE_NUMBER}}', toThaiDigits_(leaveNumber));
  // หรือ placeholder จริงที่โปรเจกต์ใช้อยู่

  ...

  return {
    ok: true,
    leaveNumber: leaveNumber,
    workingDocumentId: workingDocumentId,
    workingDocumentUrl: workingDocumentUrl,
    requestFolderId: requestFolderId,
    evidenceFileId: evidenceFileId || '',
    evidenceFileUrl: evidenceFileUrl || ''
  };
}
*/
