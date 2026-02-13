import { Footer } from "./Footer";
import { HomePage } from "./HomePage";
import { Product } from "./Product";
import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Cart } from "./Cart";
import { Header } from "./Header";
import { useCart } from "./gen/boutique/v1/demo_rbt_react";
import "./static/styles/cart.css";
import "./static/styles/order.css";
import "./static/styles/styles.css";

const CART_ACTOR_ID = "my-cart";

function App() {
  const [userCurrency, setUserCurrency] = useState("USD");
  const [currencies, setCurrencies] = useState(["USD"]);

  const { useGetItems } = useCart({ id: CART_ACTOR_ID });

  useEffect(() => {
    fetch(`${import.meta.env.VITE_REBOOT_URL}/get_supported_currencies`)
      .then(async (res) => res.json())
      .then((json: { currencyCodes: string[] }) => {
        setCurrencies(json.currencyCodes);
      })
      .catch((error: unknown) => console.log(error));
  }, []);

  const { response } = useGetItems();

  return (
    <>
      <Header
        frontendMessage={null}
        showCurrency={true}
        userCurrency={userCurrency}
        setUserCurrency={setUserCurrency}
        currencies={currencies}
        cartSize={response === undefined ? 0 : response.items.length}
      />
      <Routes>
        <Route index element={<HomePage userCurrency={userCurrency} />} />
        <Route
          path="product/:productId"
          element={
            <Product cartId={CART_ACTOR_ID} userCurrency={userCurrency} />
          }
        />
        <Route
          path="cart"
          element={<Cart cartId={CART_ACTOR_ID} userCurrency={userCurrency} />}
        />
      </Routes>
      <Footer />
    </>
  );
}

export default App;
