import { useProductCatalog } from "./gen/boutique/v1/demo_rbt_react";
import { Link } from "react-router-dom";
import {
  CATALOG_SINGLETON_ID,
  ProductEntry,
  productsToEntries,
  renderMoney,
  useCurrencyConvertProducts,
} from "./helpers";

interface HomePageProps {
  userCurrency: string;
}

export const HomePage = ({ userCurrency }: HomePageProps) => {
  const { useListProducts } = useProductCatalog({ id: CATALOG_SINGLETON_ID });

  const { response } = useListProducts();
  const products = useCurrencyConvertProducts(response?.products, userCurrency);
  const productEntries = productsToEntries(products);

  if (productEntries.length === 0)
    return <div style={{ height: "100vh" }}></div>;

  return (
    <div className="App">
      <div className="local">
        <span className="platform-flag">local</span>
      </div>
      <main role="main" className="home">
        <div className="home-mobile-hero-banner d-lg-none"></div>
        <div className="container-fluid">
          <div className="row">
            <div className="col-4 d-none d-lg-block home-desktop-left-image"></div>
            <div className="col-12 col-lg-8">
              <div className="row hot-products-row px-xl-6">
                <div className="col-12">
                  <h3>Hot Products</h3>
                </div>
                {productEntries.map((product: ProductEntry) => (
                  <div
                    className="col-md-4 hot-product-card"
                    key={product.item.id}
                  >
                    <Link to={`/product/${product.item.id}`}>
                      <img alt="" src={`${product.item.picture}`} />
                      <div className="hot-product-card-img-overlay"></div>
                    </Link>
                    <div>
                      <div className="hot-product-card-name">
                        {product.item.name}
                      </div>
                      <div className="hot-product-card-price">
                        {renderMoney(product.price)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row d-none d-lg-block home-desktop-footer-row">
                <div className="col-12 p-0"></div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <div className="d-lg-none"></div>
    </div>
  );
};
