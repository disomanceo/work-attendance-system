type PersonDisplayInput = {
  name?: string | null;
  role?: string | null;
  position?: string | null;
};

const THAI_TITLES =
  /^(นาย|นางสาว|นาง|น\.ส\.|ดร\.|ครู|ผอ\.|รองผอ\.|ว่าที่ร้อยตรี|ว่าที่ ร\.ต\.)\s*/u;

function text(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function firstThaiName(value: string) {
  const cleanName = text(value).replace(THAI_TITLES, "").trim();
  return cleanName.split(/\s+/)[0] || cleanName;
}

function isDirectorLike(input: PersonDisplayInput) {
  const role = text(input.role).toLowerCase();
  const position = text(input.position);
  const name = text(input.name);

  return (
    role === "director" ||
    position.includes("ผู้อำนวยการ") ||
    position.includes("ผู้บริหาร") ||
    position.includes("ผอ.") ||
    name.startsWith("ผอ.") ||
    name.includes("สุธน")
  );
}

export function compactPersonDisplayName(input: PersonDisplayInput) {
  const name = text(input.name);
  if (!name || name === "-") return "-";

  const firstName = firstThaiName(name);
  if (!firstName) return "-";

  if (isDirectorLike(input)) {
    return `ผอ.${firstName}`;
  }

  return firstName.startsWith("ครู") ? firstName : `ครู${firstName}`;
}

export function normalizeDirectorDisplayName(input: PersonDisplayInput) {
  const name = text(input.name);
  if (!name || name === "-") return "-";

  if (isDirectorLike(input)) {
    return compactPersonDisplayName(input);
  }

  return name.replace(/^ครูสุธน\b/u, "ผอ.สุธน");
}
