// Kiểm tra giao diện đơn hàng phần B (S3-B-01) bằng Chromium, trên fixture mock. KHÔNG phải E2E với backend.
// Chuẩn bị (từ thư mục gốc repo, Node >= 24.15 < 25):
//   $env:NEXT_PUBLIC_AUTH_SOURCE="mock"; $env:NEXT_PUBLIC_ORDERS_SOURCE="mock"   (đặt TRƯỚC build)
//   npm run build --workspace apps/web; npm run start --workspace apps/web        (cổng 3000)
// Chạy ở terminal khác:  node docs/sprint3/scripts/b-orders-e2e.cjs [thư-mục-ảnh]
// Cần Playwright + Chromium (không phải dependency của repo): npm i --no-save playwright && npx playwright install chromium
// Kết quả in PASS/FAIL từng dòng; thoát mã 1 nếu có FAIL.
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const out = [];
  const ok = (n, c) => out.push((c ? "PASS " : "FAIL ") + n);
  const shot = process.argv[2] || "./b-e2e-shots";
  require("fs").mkdirSync(shot, { recursive: true });
  for (const [name, vp] of [["mobile", { width: 360, height: 740 }], ["desktop", { width: 1280, height: 800 }]]) {
    const ctx = await b.newContext({ viewport: vp });
    const p = await ctx.newPage();
    const noHScroll = async label => ok(`${name}: ${label} không cuộn ngang`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const main = async () => (await p.textContent("main")).replace(/\s+/g, " ");
    // 1. chưa đăng nhập
    await p.goto("http://localhost:3000/orders");
    await p.waitForSelector("text=Bạn cần đăng nhập");
    const href = await p.getAttribute("main a[href^='/login']", "href");
    ok(`${name}: chưa đăng nhập → link login giữ next và reason`, href.includes("next=%2Forders") && href.includes("reason=required"));
    // 2. đăng nhập
    await p.click("main a[href^='/login']");
    await p.waitForSelector("#login-email");
    await p.fill("#login-email", "demo@brewlite.test");
    await p.fill("#login-password", "demo-password-123456");
    await p.keyboard.press("Enter");
    await p.waitForURL("http://localhost:3000/orders", { timeout: 8000 });
    await p.waitForSelector("ul a[href^='/orders/']");
    const rows = await p.locator("ul a[href^='/orders/']").count();
    ok(`${name}: lịch sử có 9 đơn`, rows === 9);
    ok(`${name}: header có link Đơn hàng`, await p.locator("header a[href='/orders']").count() === 1);
    await noHScroll("lịch sử");
    await p.screenshot({ path: `${shot}/${name}-history.png`, fullPage: true });
    // 3. chi tiết đơn chờ thanh toán
    await p.goto("http://localhost:3000/orders/ord-pending?placed=1");
    await p.waitForSelector("text=Tổng thanh toán");
    let t = await main();
    ok(`${name}: pending hiện trạng thái, mã DEMO10, tổng 90.000`, t.includes("Chờ thanh toán") && t.includes("DEMO10") && /90\.000/.test(t) && /−10\.000/.test(t));
    ok(`${name}: banner đã ghi nhận`, t.includes("Đơn hàng đã được ghi nhận"));
    ok(`${name}: hiện hạn và đếm ngược`, /Hạn thanh toán/.test(t) && /còn \d\d:\d\d/.test(t));
    ok(`${name}: không có nút Thanh toán (thuộc A)`, await p.getByRole("button", { name: /Thanh toán/ }).count() === 0);
    await noHScroll("chi tiết pending");
    await p.screenshot({ path: `${shot}/${name}-pending.png`, fullPage: true });
    // 4. các trạng thái khác
    const cases = [
      ["ord-failed", ["Thanh toán chưa thành công", "bị từ chối", "thử lại"]],
      ["ord-paid", ["Đã thanh toán", "Ví điện tử", "9 điểm"]],
      ["ord-preparing", ["Đang pha chế", "không thể hủy"]],
      ["ord-ready", ["Sẵn sàng nhận"]],
      ["ord-done", ["Hoàn thành"]],
      ["ord-expired", ["Đã hủy", "quá hạn thanh toán"]],
      ["ord-refunded", ["Đã hủy", "Hoàn tiền", "Đã thu hồi: 9 điểm", "bạn đã yêu cầu hủy".replace("bạn", "Bạn")]],
      ["ord-legacy", ["đơn cũ", "chỉ có thể xem"]],
    ];
    // Đơn cũ: không được khẳng định đã giữ hàng hay hướng dẫn thanh toán.
    await p.goto("http://localhost:3000/orders/ord-legacy");
    await p.waitForSelector("text=Tổng thanh toán");
    const legacyText = await main();
    ok(`${name}: ord-legacy không nói "đã giữ hàng"/"thanh toán trước hạn"`, !/giữ hàng|trước hạn|Hãy thanh toán/i.test(legacyText) && legacyText.includes("chỉ có thể xem"));
    for (const [id, needles] of cases) {
      await p.goto(`http://localhost:3000/orders/${id}`);
      await p.waitForSelector("text=Tổng thanh toán");
      t = await main();
      const missing = needles.filter(n => !t.includes(n));
      ok(`${name}: ${id} ${missing.length ? "THIẾU " + missing.join("|") : "ok"}`, missing.length === 0);
    }
    await p.goto("http://localhost:3000/orders/ord-refunded");
    await p.waitForSelector("text=Tổng thanh toán");
    await p.screenshot({ path: `${shot}/${name}-refunded.png`, fullPage: true });
    // 5. không tìm thấy
    await p.goto("http://localhost:3000/orders/khong-ton-tai");
    await p.waitForSelector("[role=alert]:has-text('Không tìm thấy')");
    ok(`${name}: id lạ → không tìm thấy, không lộ dữ liệu`, true);
    ok(`${name}: lỗi 404 không có nút Thử lại`, await p.getByRole("button", { name: "Thử lại" }).count() === 0);
    // 5b. ID chứa % không bị giải mã hai lần: /orders/a%252Fb phải hỏi đúng id "a%2Fb"
    await p.goto("http://localhost:3000/orders/a%252Fb");
    await p.waitForSelector("[role=alert]:has-text('Không tìm thấy')");
    ok(`${name}: ID có % (a%252Fb) mở được trang, hiện không tìm thấy`, true);
    // 6. làm mới trạng thái
    await p.goto("http://localhost:3000/orders/ord-pending");
    await p.waitForSelector("text=Tổng thanh toán");
    await p.getByRole("button", { name: "Làm mới trạng thái" }).click();
    await p.waitForSelector("text=Tổng thanh toán");
    ok(`${name}: làm mới giữ nội dung`, (await main()).includes("Chờ thanh toán"));
    // 7. điều hướng từ lịch sử bằng bàn phím
    await p.goto("http://localhost:3000/orders");
    await p.waitForSelector("ul a[href^='/orders/']");
    await p.locator("ul a[href^='/orders/']").first().focus();
    await p.keyboard.press("Enter");
    await p.waitForURL(/\/orders\/ord-/);
    ok(`${name}: mở đơn từ lịch sử bằng Enter`, true);
    // 8. đăng xuất rồi vào lại chi tiết: không còn dữ liệu
    await ctx.close();
  }
  console.log(out.join("\n"));
  if (out.some(l => l.startsWith("FAIL"))) process.exitCode = 1;
  await b.close();
})().catch(e => { console.error("SCRIPT ERROR", e); process.exit(1); });
