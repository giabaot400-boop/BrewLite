import type { LogoutInfo } from "../auth-session.ts";

/**
 * Nội dung xác nhận theo S2-R05 và P05. `info` null nghĩa là module giỏ hàng chưa nối vào:
 * khi đó không nói gì về giỏ để khỏi khẳng định điều chưa kiểm chứng.
 */
export function logoutDialogLines(info: LogoutInfo | null): string[] {
  if (!info) return ["Bạn có chắc muốn đăng xuất không?"];
  const lines: string[] = [];
  if (info.cartItemCount > 0) {
    lines.push(`Đăng xuất sẽ xóa ${info.cartItemCount} món trong giỏ hàng trên thiết bị này.`);
  }
  if (info.hasPendingOrder) {
    lines.push(
      "Lần đặt gần nhất chưa rõ kết quả sẽ không bị hủy; thông tin lần đặt được giữ lại để bạn kiểm tra sau khi đăng nhập lại.",
    );
  }
  if (info.hasCheckoutOrder) {
    lines.push("Đơn đã tạo không bị hủy khi đăng xuất; thông tin đơn được giữ để bạn kiểm tra sau khi đăng nhập lại.");
  }
  if (info.hasUnresolvedPayment) {
    lines.push("Lần thanh toán chưa rõ kết quả được giữ lại. Hãy đăng nhập đúng tài khoản để kiểm tra và khôi phục lần đó.");
  }
  return lines.length > 0 ? lines : ["Bạn có chắc muốn đăng xuất không?"];
}

/** Giỏ rỗng và không có lần đặt chưa rõ kết quả thì đăng xuất trực tiếp (S2-R05). */
export function needsLogoutConfirmation(info: LogoutInfo | null): boolean {
  return info === null || info.cartItemCount > 0 || info.hasPendingOrder || info.hasCheckoutOrder === true || info.hasUnresolvedPayment === true;
}
