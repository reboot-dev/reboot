import { useEffect, useState } from "react";
import { CartItem, Money, Product } from "./gen/boutique/v1/demo_pb";

export const SHIPPING_SINGLETON_ID = "shipping";
export const CHECKOUT_SINGLETON_ID = "checkout";
export const CATALOG_SINGLETON_ID = "product-catalog";

export interface ProductItem {
  product: Product;
  item: CartItem;
}

export interface ProductEntry {
  item: Product;
  price: Money | undefined;
}

export const convertedShippingCost = async (
  cost: Money,
  userCurrency: string
): Promise<Money> => {
  if (userCurrency === "USD") {
    return cost;
  }

  const fakeProduct = {
    id: "noop",
    name: "fake",
    description: "this is the wrong api",
    price: cost,
  };
  const response = await fetch(`${import.meta.env.VITE_REBOOT_URL}/convert`, {
    method: "POST",
    body: JSON.stringify({
      products: [fakeProduct],
      toCode: userCurrency,
    }),
  });
  const json = await response.json();

  return json.products[0].price;
};

export const useCurrencyConvertProductItems = (
  productItems: ProductItem[] | undefined,
  userCurrency: string
) => {
  const [convertedProductItems, setConvertedProductItems] = useState<
    ProductItem[]
  >([]);

  useEffect(() => {
    if (productItems === undefined) return;

    if (userCurrency === "USD") {
      setConvertedProductItems(productItems);
    } else {
      fetch(`${import.meta.env.VITE_REBOOT_URL}/convert`, {
        method: "POST",
        body: JSON.stringify({
          products: productItems.map(
            (productItem: ProductItem) => productItem.product
          ),
          toCode: userCurrency,
        }),
      })
        .then((res) => res.json())
        .then((json) => {
          const convertedProductItems = json.products.map(
            (product: Product) => ({
              product: product,
              item: productItems.find(
                (productItem: ProductItem) =>
                  productItem.item.productId === product.id
              )?.item,
            })
          );
          setConvertedProductItems(convertedProductItems);
        });
    }
  }, [productItems, userCurrency]);

  return convertedProductItems;
};

export const useCurrencyConvertProducts = (
  product: Product[] | Product | undefined,
  userCurrency: string
) => {
  const [convertedProducts, setConvertedProducts] = useState<Product[]>([]);

  useEffect(() => {
    const products =
      product instanceof Array || product === undefined ? product : [product];

    if (products === undefined) {
      return;
    }

    if (userCurrency === "USD") {
      setConvertedProducts(products);
    } else {
      fetch(`${import.meta.env.VITE_REBOOT_URL}/convert`, {
        method: "POST",
        body: JSON.stringify({
          products: products,
          toCode: userCurrency,
        }),
      })
        .then((res) => res.json())
        .then((json) => {
          setConvertedProducts(json.products);
        })
        .catch((e: unknown) => console.log(e));
    }
  }, [product, userCurrency]);

  return convertedProducts;
};

export const totalOrderCost = (
  productItems: ProductItem[],
  shippingCost: Money,
  currencyCode: string
) => {
  let totalCostInt = 0;
  for (const item of productItems) {
    const itemPrice = Number(renderMoney(item.product.price).substring(1));
    totalCostInt += itemPrice * item.item.quantity;
  }
  totalCostInt = totalCostInt + Number(renderMoney(shippingCost).substring(1));
  return new Money({
    currencyCode: currencyCode,
    units: BigInt(totalCostInt.toFixed(2).split(".")[0]),
    nanos: Number(totalCostInt.toFixed(2).split(".")[1] + "0000000"),
  });
};

export const multiplyMoney = (money: Money | undefined, multiplier: number) => {
  if (money === undefined) return undefined;
  const moneyValue = Number(renderMoney(money).substring(1));
  const multipliedValue = moneyValue * multiplier;
  return new Money({
    currencyCode: money.currencyCode,
    units: BigInt(multipliedValue.toFixed(2).split(".")[0]),
    nanos: Number(multipliedValue.toFixed(2).split(".")[1] + "0000000"),
  });
};

export const addMoney = (moneyA: Money, moneyB: Money): Money => {
  if (moneyA.currencyCode !== moneyB.currencyCode) {
    // This is a bug! Fix!
    return new Money();
  }

  const moneyAInt = Number(
    `${moneyA.units}.${(moneyA.nanos / 1000000000).toFixed(2).split(".")[1]}`
  );
  const moneyBInt = Number(
    `${moneyB.units}.${(moneyB.nanos / 1000000000).toFixed(2).split(".")[1]}`
  );

  const moneyInt = moneyAInt + moneyBInt;

  return new Money({
    units: BigInt(moneyInt.toString().split(".")[0]),
    nanos: Number(moneyInt.toString().split(".")[1] + "0000000"),
    currencyCode: moneyA.currencyCode,
  });
};

export const renderMoney = (money: Money | undefined) => {
  if (money === undefined) return "?";
  const logo = renderCurrencyLogo(money.currencyCode);
  const cents = (money.nanos / 1000000000).toFixed(2).split(".")[1];
  return `${logo}${money.units}.${cents}`;
};

export const renderCurrencyLogo = (currencyCode: string): string => {
  const logos: { [key: string]: string } = {
    USD: "$",
    CAN: "$",
    JPY: "¥",
    EUR: "€",
    TRY: "₺",
    GBP: "£",
  };

  if (logos[currencyCode] === undefined) {
    return "$";
  }

  return logos[currencyCode];
};

export const productToEntry = (product: Product): ProductEntry => {
  return {
    item: product,
    price: product.price,
  };
};

export const productsToEntries = (products: Product[]): ProductEntry[] => {
  return products.map((product: Product) => productToEntry(product));
};
