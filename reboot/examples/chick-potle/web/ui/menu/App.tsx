import { useState, type FC } from "react";
import { useFoodOrder } from "@api/ai_chat_food/v1/food_rbt_react";
import css from "./App.module.css";

export const MenuApp: FC = () => {
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const order = useFoodOrder();
  const { response: menuRes, isLoading: menuLoading } = order.useGetMenu();
  const { response: cartRes } = order.useGetCart();

  if (menuLoading && menuRes === undefined) {
    return (
      <div className={css.container}>
        <div className={css.loading}>loading menu...</div>
      </div>
    );
  }

  const items = menuRes?.items ?? [];
  const cartEntries = cartRes?.entries ?? [];

  const getCartQty = (index: number) => {
    const entry = cartEntries.find((e) => e.itemIndex === index);
    return entry?.quantity ?? 0;
  };

  // Group items by category.
  const categories = [...new Set(items.map((item) => item.category))];

  const handleAdd = async (index: number) => {
    setPendingIndex(index);
    try {
      await order.addToCart({ itemIndex: index, quantity: 1 });
    } finally {
      setPendingIndex(null);
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className={css.container}>
      <div className={css.header}>Chick-potle</div>
      <div className={css.subheader}>Delicious Mexican</div>
      {categories.map((cat) => (
        <div key={cat} className={css.section}>
          <div className={css.categoryHeader}>{cat}</div>
          <div className={css.grid}>
            {items.map((item, i) => {
              if (item.category !== cat) return null;
              const qty = getCartQty(i);
              return (
                <div key={i} className={css.card}>
                  <div className={css.emojiArea}>{item.emoji}</div>
                  <div className={css.info}>
                    <div className={css.name}>{item.name}</div>
                    <div className={css.description}>{item.description}</div>
                    <div className={css.priceRow}>
                      <span className={css.price}>
                        {formatPrice(item.priceCents)}
                      </span>
                      {qty > 0 && <span className={css.inCart}>x{qty}</span>}
                    </div>
                    <button
                      className={css.addButton}
                      onClick={() => handleAdd(i)}
                      disabled={pendingIndex === i}
                    >
                      {pendingIndex === i ? "adding..." : "+ Add"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
