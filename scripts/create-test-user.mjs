import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const phone = "66812345678";
const email = `${phone}@attendance.local`;
const pin = "654321";

const { data: existingUsers, error: listError } =
  await supabase.auth.admin.listUsers();

if (listError) {
  console.error("ตรวจสอบผู้ใช้ไม่สำเร็จ:", listError.message);
  process.exit(1);
}

const existingUser = existingUsers.users.find(
  (user) => user.email === email || user.phone === phone
);

if (existingUser) {
  const { data, error } = await supabase.auth.admin.updateUserById(
    existingUser.id,
    {
      email,
      password: pin,
      email_confirm: true,
      user_metadata: {
        full_name: "ผู้ใช้ทดลอง",
        role: "staff",
        phone,
      },
    }
  );

  if (error) {
    console.error("อัปเดตผู้ใช้ไม่สำเร็จ:", error.message);
    process.exit(1);
  }

  console.log("อัปเดตบัญชีทดลองสำเร็จ");
  console.log("User ID:", data.user.id);
  console.log("Login email:", data.user.email);
  console.log("กรอกหน้าเว็บ: 0812345678");
  console.log("PIN: 654321");
  process.exit(0);
}

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password: pin,
  email_confirm: true,
  user_metadata: {
    full_name: "ผู้ใช้ทดลอง",
    role: "staff",
    phone,
  },
});

if (error) {
  console.error("สร้างผู้ใช้ไม่สำเร็จ:", error.message);
  process.exit(1);
}

console.log("สร้างบัญชีทดลองสำเร็จ");
console.log("User ID:", data.user.id);
console.log("Login email:", data.user.email);
console.log("กรอกหน้าเว็บ: 0812345678");
console.log("PIN: 654321");
