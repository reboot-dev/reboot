import { Link } from "react-router-dom";
import { renderCurrencyLogo } from "./helpers";

interface HeaderProps {
  frontendMessage: string | null;
  showCurrency: boolean;
  userCurrency: string;
  currencies: string[];
  cartSize: number;
  setUserCurrency: (currency: string) => void;
}

export const Header = ({
  frontendMessage,
  showCurrency,
  userCurrency,
  currencies,
  cartSize,
  setUserCurrency,
}: HeaderProps) => {
  return (
    <header>
      {frontendMessage !== undefined && (
        <div className="navbar">
          <div className="container d-flex justify-content-center">
            <div className="h-free-shipping">{frontendMessage}</div>
          </div>
        </div>
      )}
      <div className="navbar sub-navbar">
        <div className="container d-flex justify-content-between">
          <Link to="/" className="navbar-brand d-flex align-items-center">
            <img
              alt="Online Boutique Home Link"
              src="/static/icons/Hipster_NavLogo.svg"
              className="top-left-logo"
            />
          </Link>
          <div className="controls">
            {showCurrency && (
              <div className="h-controls">
                <div className="h-control">
                  <span className="icon currency-icon">
                    {" "}
                    {renderCurrencyLogo(userCurrency)}
                  </span>
                  <form
                    method="POST"
                    className="controls-form"
                    action="/setCurrency"
                    id="currency_form"
                  >
                    <select
                      name="currency_code"
                      value={userCurrency}
                      onChange={(event) => setUserCurrency(event?.target.value)}
                    >
                      {currencies.map((currency: string) => (
                        <option key={currency} value={`${currency}`}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </form>
                  <img
                    src="./static/icons/Hipster_DownArrow.svg"
                    alt=""
                    className="icon arrow"
                  />
                </div>
              </div>
            )}

            <Link to="/cart" className="cart-link">
              <img
                src="/static/icons/Hipster_CartIcon.svg"
                alt="Cart icon"
                className="logo"
                title="Cart"
              />
              {cartSize > 0 && (
                <span className="cart-size-circle">{cartSize}</span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};
