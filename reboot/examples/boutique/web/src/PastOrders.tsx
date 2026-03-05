import { PartialMessage } from "@bufbuild/protobuf";
import type { ResponseOrAborted } from "@reboot-dev/reboot-web";
import {
  GetProductRequest,
  OrderResult,
  OrdersResponse,
  PlaceOrderRequest,
  Product,
} from "./gen/boutique/v1/demo_pb";
import { ProductCatalogGetProductAborted } from "./gen/boutique/v1/demo_rbt_react";
import {
  ProductItem,
  multiplyMoney,
  renderMoney,
  totalOrderCost,
} from "./helpers";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import css from "./PastOrders.module.css";

interface OrdersSummaryProps {
  getProduct: (
    partialRequest?: PartialMessage<GetProductRequest> | undefined
  ) => Promise<ResponseOrAborted<Product, ProductCatalogGetProductAborted>>;
  userCurrency: string;
  response: OrdersResponse | undefined;
  pendingPlaceOrderMutations: {
    request: PlaceOrderRequest;
    idempotencyKey: string;
    isLoading: boolean;
    error?: unknown;
    data?: any;
  }[];
}

export const PastOrders = ({
  getProduct,
  userCurrency,
  pendingPlaceOrderMutations,
  response,
}: OrdersSummaryProps) => {
  const [orderDetails, setOrderDetails] = useState<{
    [id: string]: ProductItem[];
  }>({});

  useEffect(() => {
    async function runEffect() {
      if (response !== undefined) {
        for (const order of response.orders) {
          const productItems: ProductItem[] = [];

          for (const orderItem of order.items) {
            if (orderItem !== undefined && orderItem.item !== undefined) {
              const { response: productDetails } = await getProduct({
                id: orderItem.item.productId,
              });

              const item = orderItem.item;

              if (productDetails !== undefined) {
                productItems.push({
                  product: productDetails,
                  item: item,
                });

                const newOrderDetail: {
                  [id: string]: ProductItem[];
                } = {};

                newOrderDetail[order.orderId] = productItems;

                setOrderDetails((orderDetails) => ({
                  ...orderDetails,
                  ...newOrderDetail,
                }));
              }
            }
          }
        }
      }
    }
    runEffect();
  }, [response]);

  return (
    <section className="container" style={{ marginTop: 10 }}>
      {pendingPlaceOrderMutations?.map(({ data, idempotencyKey }) => {
        return (
          data !== undefined && (
            <div key={idempotencyKey}>
              <div className="row mb-3 py-2">
                <div className="col-4 pl-md-0">
                  <h3>Past Orders</h3>
                </div>
              </div>
              {data.convertedProductItems.map((productItem: ProductItem) => (
                <PastOrder
                  productItem={productItem}
                  loading={true}
                  key={productItem.product.id}
                />
              ))}
            </div>
          )
        );
      })}
      {response?.orders.map((orderResult: OrderResult) => {
        const productItems = orderDetails[orderResult.orderId];
        return (
          productItems !== undefined && (
            <div key={orderResult.orderId}>
              <div className="row cart-summary-total-row order-summary-total-row">
                <div className="col-md-10 pl-md-0">
                  Order ID: {orderResult.orderId}
                </div>
                {orderResult.shippingCost !== undefined && (
                  <div className="col-md-2 pr-md-0 text-right">
                    {renderMoney(
                      totalOrderCost(
                        productItems,
                        orderResult.shippingCost,
                        userCurrency
                      )
                    )}
                  </div>
                )}
              </div>
              {productItems.map((productItem: ProductItem) => {
                return (
                  <PastOrder
                    productItem={productItem}
                    loading={false}
                    key={productItem.product.id}
                  />
                );
              })}
            </div>
          )
        );
      })}
    </section>
  );
};

interface PastOrderProps {
  productItem: ProductItem;
  loading: boolean;
}
const PastOrder = ({ productItem, loading }: PastOrderProps) => (
  <div
    className="row cart-summary-item-row border-top-0"
    key={productItem.product.id}
  >
    <div className="col-md-2 pl-md-0">
      <Link to={`/product/${productItem.item.productId}`}>
        <img className="img-fluid" alt="" src={productItem.product.picture} />
      </Link>
    </div>
    <div className="col-md-10 pr-md-0">
      <div className="row">
        <div className="col">
          <h4>{productItem.product.name}</h4>
        </div>
      </div>
      <div className="row cart-summary-item-row-item-id-row">
        <div className="col">SKU #{productItem.product.id}</div>
        {loading && <div className={css.spinner}></div>}
      </div>
      <div className="row">
        <div className="col">Quantity: {productItem.item.quantity}</div>
        {productItem.product.price !== undefined && (
          <div className="col pr-md-0 text-right">
            <strong>
              {renderMoney(
                multiplyMoney(
                  productItem.product.price,
                  productItem.item.quantity
                )
              )}
            </strong>
          </div>
        )}
      </div>
    </div>
  </div>
);
