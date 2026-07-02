import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ระบบลงเวลาปฏิบัติงาน โรงเรียนวัดไผ่มุ้ง",
    short_name: "ลงเวลา",
    description: "ระบบลงเวลาปฏิบัติงานสำหรับครูและบุคลากร โรงเรียนวัดไผ่มุ้ง",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1ff",
    theme_color: "#5b33a0",
    lang: "th",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
