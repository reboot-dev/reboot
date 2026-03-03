import { useCart, useProductCatalog } from "./gen/boutique/v1/demo_rbt_react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CATALOG_SINGLETON_ID,
  productToEntry,
  renderMoney,
  useCurrencyConvertProducts,
} from "./helpers";

interface ProductProps {
  cartId: string;
  userCurrency: string;
}

export const Product = ({ cartId, userCurrency }: ProductProps) => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [selectedQuantity, setSelectedQuantity] = useState("1");

  const { addItem } = useCart({ id: cartId });
  const { useGetProduct } = useProductCatalog({
    id: CATALOG_SINGLETON_ID,
  });
  const { response: product } = useGetProduct({ id: productId });

  const products = useCurrencyConvertProducts(product, userCurrency);

  if (products.length === 0) return <div style={{ height: "100vh" }}></div>;
  const productEntry = productToEntry(products[0]);

  const handleSubmit = () => {
    addItem({
      item: {
        productId: productEntry.item.id,
        quantity: +selectedQuantity,
        addedAt: BigInt(Date.now()),
      },
    });
    navigate("/cart");
  };

  return (
    <>
      <div className="local">
        <span className="platform-flag">local</span>
      </div>
      <main role="main">
        <div className="h-product container">
          <div className="row">
            <div className="col-md-6">
              <img
                className="product-image"
                alt=""
                src={productEntry.item.picture}
              />
            </div>
            <div className="product-info col-md-5">
              <div className="product-wrapper">
                <h2>{productEntry.item.name}</h2>
                <p className="product-price">
                  {renderMoney(productEntry.price)}
                </p>
                <p>{productEntry.item.description}</p>

                <form onSubmit={handleSubmit}>
                  <input
                    type="hidden"
                    name="product_id"
                    value={productEntry.item.id}
                  />
                  <div className="product-quantity-dropdown">
                    <select
                      onChange={(e) => setSelectedQuantity(e.target.value)}
                      name="quantity"
                      id="quantity"
                      value={selectedQuantity}
                    >
                      <option>1</option>
                      <option>2</option>
                      <option>3</option>
                      <option>4</option>
                      <option>5</option>
                      <option>10</option>
                    </select>
                    <img src="/static/icons/Hipster_DownArrow.svg" alt="" />
                  </div>
                  <button type="submit" className="cymbal-button-primary">
                    Add To Cart
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};
