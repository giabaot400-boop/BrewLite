import { formatDiscount, formatMoney } from "../order-format";
import type { OrderDetail } from "../types";

/** Danh sách món của đơn: giá từng dòng do server chốt, UI không tính lại. */
export function OrderLines({ items }: { items: OrderDetail["items"] }) {
  return (
    <ul className="divide-y divide-stone-200">
      {items.map((line, index) => (
        <li key={`${line.productId}-${line.size}-${index}`} className="flex items-start justify-between gap-4 py-3">
          <div>
            <p className="font-semibold">
              {line.productName} <span className="font-normal text-stone-600">· size {line.size}</span>
            </p>
            {line.toppings.length > 0 && (
              <p className="text-sm text-stone-600">
                Topping: {line.toppings.map(t => t.name).join(", ")}
              </p>
            )}
            <p className="text-sm text-stone-600">
              {line.qty} × {formatMoney(line.unitPrice)}
            </p>
          </div>
          <p className="tabular-nums font-semibold">{formatMoney(line.lineTotal)}</p>
        </li>
      ))}
    </ul>
  );
}

/** Tạm tính, giảm giá và tổng chính thức. Tổng này mới là số tiền phải trả. */
export function OrderTotals({ order }: { order: Pick<OrderDetail, "subtotal" | "discountTotal" | "total" | "promotion"> }) {
  return (
    <dl className="space-y-2 border-t border-stone-200 pt-4">
      <div className="flex justify-between">
        <dt className="text-stone-600">Tạm tính</dt>
        <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
      </div>
      {order.promotion && (
        <div className="flex justify-between">
          <dt className="text-stone-600">Mã {order.promotion.code}</dt>
          <dd className="tabular-nums text-green-800">{formatDiscount(order.promotion.discountAmount)}</dd>
        </div>
      )}
      <div className="flex justify-between text-lg font-bold">
        <dt>Tổng thanh toán</dt>
        <dd className="tabular-nums">{formatMoney(order.total)}</dd>
      </div>
    </dl>
  );
}
