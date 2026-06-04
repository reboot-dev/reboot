import { type FC } from "react";
import { useOrder } from "@api/reboot_swag_store/v1/store_rbt_react";
import css from "./App.module.css";

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ConfirmationApp: FC = () => {
  const order = useOrder();
  const { response, isLoading } = order.useGetDetails();

  if (isLoading && !response) {
    return (
      <div className={css.container}>
        <div className={css.loading}>Loading order...</div>
      </div>
    );
  }

  if (!response || !response.orderId) {
    return (
      <div className={css.container}>
        <div className={css.loading}>Order not found.</div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <div className={css.checkmark}>&#10003;</div>
      <h1 className={css.title}>Order Confirmed!</h1>
      <p className={css.orderId}>Order #{response.orderId.slice(0, 8)}</p>
      <p className={css.date}>{formatDate(response.createdAt)}</p>

      <div className={css.items}>
        {response.items.map((item) => (
          <div key={item.productId} className={css.item}>
            <div className={css.itemInfo}>
              <span className={css.itemName}>
                {item.name}
                {item.size && ` (${item.size})`}
              </span>
              <span className={css.itemQty}>x{item.quantity}</span>
            </div>
            <span className={css.itemPrice}>
              {formatPrice(item.priceCents * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      <div className={css.totals}>
        <div className={css.totalRow}>
          <span>Subtotal</span>
          <span>{formatPrice(response.subtotalCents)}</span>
        </div>
        <div className={css.totalRow}>
          <span>Shipping</span>
          <span>{formatPrice(response.shippingCents)}</span>
        </div>
        <div className={`${css.totalRow} ${css.totalFinal}`}>
          <span>Total</span>
          <span>{formatPrice(response.totalCents)}</span>
        </div>
      </div>

      {response.shippingName && (
        <p className={css.cardInfo}>Shipping to {response.shippingName}</p>
      )}
    </div>
  );
};
