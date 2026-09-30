import type { Item } from "../api/catalog/items_rbt_types";
import type { CashPayment } from "../api/catalog/payments_rbt_types";
import type { Money } from "../api/common/money_rbt_types";
import { useStore } from "../api/store/v1/store_rbt_react";
import type { Receipt } from "../api/store/v1/store_rbt_types";
import { useWarehouse } from "../api/warehouse/v1/warehouse_rbt_react";

const format = ({ cents, currency }: Money) =>
  `${(cents / 100).toFixed(2)} ${currency}`;

const WIDGET: Item = {
  name: "widget",
  price: {
    amount: { cents: 1000, currency: "USD" },
    discounts: [{ cents: 100, currency: "USD" }],
    tax: { cents: 50, currency: "USD" },
  },
};

export const App = () => {
  const store = useStore({ id: "store" });
  const warehouse = useWarehouse({ id: "warehouse" });

  // Shared models as the responses themselves.
  const { response: revenue } = store.useRevenue();
  const { response: value } = warehouse.useValue();
  const { response: found, aborted: findAborted } = store.useFind({
    name: WIDGET.name,
  });

  const receive = async () => {
    // A shared model as the request itself.
    await warehouse.receive(WIDGET);
  };

  const restock = async () => {
    const { aborted } = await warehouse.restock({
      storeId: "store",
      name: WIDGET.name,
    });
    // A shared error of a method of another API.
    if (aborted?.error.type === "NotFoundError") {
      console.warn(`No ${aborted.error.name} to restock`);
    }
  };

  const purchase = async () => {
    const payment: CashPayment = {
      kind: "cash",
      tendered: { cents: 900, currency: "USD" },
    };
    const { response, aborted } = await store.purchase({
      name: WIDGET.name,
      payment,
    });
    if (aborted !== undefined) {
      const error = aborted.error;
      switch (error.type) {
        case "NotFoundError":
          console.warn(`No ${error.name} in the store`);
          return;
        case "InsufficientFundsError":
          // A shared error that itself holds a shared model.
          console.warn(`Short by ${format(error.shortfall)}`);
          return;
      }
      return;
    }
    // A model of one API file as the request of another's method.
    const receipt: Receipt = response;
    await warehouse.record(receipt);
  };

  const price: Money | undefined = found?.price.amount;

  return (
    <div>
      <p>Revenue: {revenue !== undefined && format(revenue)}</p>
      <p>Warehouse value: {value !== undefined && format(value)}</p>
      <p>
        Widget: {price !== undefined && format(price)}
        {findAborted?.error.type === "NotFoundError" && "not stocked"}
      </p>
      <button onClick={receive}>Receive</button>
      <button onClick={restock}>Restock</button>
      <button onClick={purchase}>Purchase</button>
    </div>
  );
};
