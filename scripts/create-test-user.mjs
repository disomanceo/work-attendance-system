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

const phone = "+66812345678";
const pin = "654321";

const { data, error } = await supabase.auth.admin.createUser({
  phone,
  password: pin,
  phone_confirm: true,
  user_metadata: {
    full_name: "ผู้ใช้ทดลอง",
    role: "staff",
  },
});

if (error) {
  console.error("สร้างผู้ใช้ไม่สำเร็จ:", error.message);
  process.exit(1);
}

console.log("สร้างผู้ใช้สำเร็จ");
console.log("User ID:", data.user.id);
console.log("Phone:", data.user.phone);