import { useState, type FC } from "react";
import { useFoodOrder } from "@api/ai_chat_food/v1/food_rbt_react";
import css from "./App.module.css";

export const CartApp: FC = () => {
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const order = useFoodOrder();
  const { response: menuRes } = order.useGetMenu();
  const { response: cartRes, isLoading } = order.useGetCart();

  if (isLoading && cartRes === undefined) {
    return (
      <div className={css.container}>
        <div className={css.loading}>loading cart...</div>
      </div>
    );
  }

  const items = menuRes?.items ?? [];
  const entries = cartRes?.entries ?? [];
  const totalCents = cartRes?.totalCents ?? 0;

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const handleRemove = async (itemIndex: number) => {
    const itemName = items[itemIndex]?.name ?? "item";
    setPendingIndex(itemIndex);
    try {
      await order.removeFromCart({ itemIndex });
    } finally {
      setPendingIndex(null);
    }
  };

  if (entries.length === 0) {
    return (
      <div className={css.container}>
        <div className={css.header}>Your Order</div>
        <div className={css.empty}>
          Your cart is empty. Add some items from the menu!
        </div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <div className={css.header}>Your Order</div>
      <div className={css.list}>
        {entries.map((entry) => {
          const item = items[entry.itemIndex];
          if (!item) return null;
          const lineTotal = item.priceCents * entry.quantity;
          return (
            <div key={entry.itemIndex} className={css.row}>
              <div className={css.emoji}>{item.emoji}</div>
              <div className={css.details}>
                <div className={css.name}>{item.name}</div>
                <div className={css.meta}>
                  {formatPrice(item.priceCents)} x {entry.quantity}
                </div>
              </div>
              <div className={css.linePrice}>{formatPrice(lineTotal)}</div>
              <button
                className={css.removeButton}
                onClick={() => handleRemove(entry.itemIndex)}
                disabled={pendingIndex === entry.itemIndex}
              >
                {pendingIndex === entry.itemIndex ? "..." : "x"}
              </button>
            </div>
          );
        })}
      </div>
      <div className={css.totalRow}>
        <span className={css.totalLabel}>Total</span>
        <span className={css.totalPrice}>{formatPrice(totalCents)}</span>
      </div>
      <div className={css.itemCount}>
        {entries.reduce((sum, e) => sum + e.quantity, 0)} items
      </div>
    </div>
  );
};
