import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const entries = [
  ["../frontend/.env.local.example", "../frontend/.env.local"],
  ["../backend/.env.example", "../backend/.env"],
];

for (const [source, target] of entries) {
  const destination = fileURLToPath(new URL(target, import.meta.url));
  if (existsSync(destination)) {
    console.log(`Giữ cấu hình đang có: ${target}`);
    continue;
  }
  copyFileSync(fileURLToPath(new URL(source, import.meta.url)), destination);
  console.log(`Đã tạo: ${target}`);
}

console.log("Frontend: http://localhost:3000 | Backend: http://localhost:3001/health");
