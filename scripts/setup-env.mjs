import { copyFileSync, existsSync, readdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";

const entries = [
  ["../apps/web/.env.local.example", "../apps/web/.env.local"],
  ["../apps/api/.env.example", "../apps/api/.env"],
];

// git moves tracked files only; local configuration stays at the old paths.
// Check every destination before moving anything. Never overwrite local secrets.
const moves = [];
for (const [legacy, current] of [["frontend", "apps/web"], ["backend", "apps/api"]]) {
  const directory = new URL(`../${legacy}/`, import.meta.url);
  if (!existsSync(directory)) continue;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!(entry.name === ".env" || entry.name.startsWith(".env.")) || entry.name.endsWith(".example")) continue;
    const source = new URL(entry.name, directory);
    const target = new URL(`../${current}/${entry.name}`, import.meta.url);
    if (!entry.isFile() || existsSync(target)) {
      console.error(`Không chuyển ${legacy}/${entry.name}: nguồn không phải file thường hoặc ${current}/${entry.name} đã tồn tại. Giữ cấu hình để kiểm tra thủ công.`);
      process.exit(1);
    }
    moves.push({ source, target, label: `${legacy}/${entry.name} -> ${current}/${entry.name}` });
  }
}
for (const { source, target, label } of moves) {
  renameSync(source, target);
  console.log(`Đã chuyển cấu hình local: ${label}`);
}

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
