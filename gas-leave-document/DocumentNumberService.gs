/**
 * DocumentNumberService.gs
 *
 * ตรวจสอบเลขเอกสารที่ส่งมาจากระบบกลาง
 *
 * รองรับชื่อฟิลด์:
 * - payload.leaveNumber      ชื่อมาตรฐานใหม่
 * - payload.documentNumber   ชื่อเดิมที่ Next.js ใช้อยู่
 *
 * Supabase เป็นแหล่งออกเลขเพียงแห่งเดียว
 * GAS จะไม่สร้างหรือเพิ่มเลขเอกสารเอง
 */

function requireDocumentNumber_(payload) {
  var source = payload || {};

  var leaveNumber = String(
    source.leaveNumber ||
    source.documentNumber ||
    ""
  ).trim();

  if (!leaveNumber) {
    throw new Error("ไม่พบเลขที่ใบลาจากระบบกลาง");
  }

  return leaveNumber;
}

/**
 * แปลงเลขอารบิกเป็นเลขไทย
 * ตั้งชื่อเฉพาะเพื่อไม่ให้ชนกับฟังก์ชันใน LeaveDocumentService.gs
 */
function documentNumberToThaiDigits_(value) {
  var thaiDigits = [
    "๐",
    "๑",
    "๒",
    "๓",
    "๔",
    "๕",
    "๖",
    "๗",
    "๘",
    "๙"
  ];

  return String(value == null ? "" : value).replace(
    /[0-9]/g,
    function (digit) {
      return thaiDigits[Number(digit)];
    }
  );
}
