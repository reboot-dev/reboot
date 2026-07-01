import { useMemo, useState, type FC } from "react";
import {
  useCart,
  useCouponBook,
} from "@api/reboot_swag_store/v1/store_rbt_react";
import { CartEmpty, InvalidCoupon } from "@api/reboot_swag_store/v1/store_pb";
import { useMcpApp } from "@reboot-dev/reboot-react";
import css from "./App.module.css";

const COUPON_BOOK_ID = "coupon-book";

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Lightweight shipping-address validation. We only ship to
// the 50 US states + DC by default, which matches what
// Printful accepts for US orders; non-US countries get a
// looser check so this example still works internationally.
const US_STATES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const US_ZIP_RE = /^\d{5}(-\d{4})?$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

type AddressField =
  | "name"
  | "email"
  | "address1"
  | "city"
  | "stateCode"
  | "zipCode"
  | "countryCode";

type Address = Record<AddressField, string>;

function validateAddress(a: Address): Partial<Record<AddressField, string>> {
  const errors: Partial<Record<AddressField, string>> = {};
  if (!a.name.trim()) errors.name = "Required";
  if (!a.email.trim()) {
    errors.email = "Required";
  } else if (!EMAIL_RE.test(a.email.trim())) {
    errors.email = "Enter a valid email address";
  }
  if (!a.address1.trim()) errors.address1 = "Required";
  if (!a.city.trim()) errors.city = "Required";

  const country = a.countryCode.trim().toUpperCase();
  if (!COUNTRY_RE.test(country)) {
    errors.countryCode = "Two-letter code (e.g. US)";
  }

  const state = a.stateCode.trim().toUpperCase();
  if (!state) {
    errors.stateCode = "Required";
  } else if (country === "US" && !US_STATES.has(state)) {
    errors.stateCode = "Unknown US state";
  }

  const zip = a.zipCode.trim();
  if (!zip) {
    errors.zipCode = "Required";
  } else if (country === "US" && !US_ZIP_RE.test(zip)) {
    errors.zipCode = "Use 5 or 9-digit ZIP";
  }

  return errors;
}

export const CartApp: FC = () => {
  const app = useMcpApp();
  const cart = useCart();
  const couponBook = useCouponBook({
    id: COUPON_BOOK_ID,
  });
  const { response, isLoading } = cart.useGetCart();

  // Shipping address fields.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [countryCode, setCountryCode] = useState("US");

  // Coupon state.
  const [couponCode, setCouponCode] = useState("");
  const [couponValid, setCouponValid] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const [isPending, setIsPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  // Which address fields the user has blurred. We only
  // surface per-field errors once the field is touched
  // (or the user clicks checkout), so the form doesn't
  // yell "Required" before they've typed anything.
  const [touched, setTouched] = useState<Partial<Record<AddressField, true>>>(
    {}
  );
  const markTouched = (field: AddressField) =>
    setTouched((t) => ({ ...t, [field]: true }));

  const addressErrors = useMemo(
    () =>
      validateAddress({
        name,
        email,
        address1,
        city,
        stateCode,
        zipCode,
        countryCode,
      }),
    [name, email, address1, city, stateCode, zipCode, countryCode]
  );
  const addressValid = Object.keys(addressErrors).length === 0;
  const errorFor = (field: AddressField) =>
    touched[field] ? addressErrors[field] : undefined;

  const items = response?.items ?? [];
  const subtotalCents = items.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0
  );
  const totalCents = couponValid ? 0 : subtotalCents;

  const handleRemove = async (productId: string) => {
    await cart.removeItem({ productId });
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setApplyingCoupon(true);
    setCouponError("");
    try {
      const result = await couponBook.validateCode({
        couponCode: couponCode.trim(),
      });
      if ("response" in result && result.response?.valid) {
        setCouponValid(true);
        setCouponError("");
      } else {
        setCouponValid(false);
        setCouponError("Invalid coupon code.");
      }
    } catch {
      setCouponValid(false);
      setCouponError("Could not validate coupon.");
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleCheckout = async () => {
    if (items.length === 0 || !couponValid) return;
    if (!addressValid) {
      setTouched({
        name: true,
        email: true,
        address1: true,
        city: true,
        stateCode: true,
        zipCode: true,
        countryCode: true,
      });
      return;
    }
    setIsPending(true);
    setCheckoutError("");
    try {
      const { response, aborted } = await cart.checkout({
        shippingAddress: {
          name,
          email,
          address1,
          address2,
          city,
          stateCode,
          zipCode,
          countryCode,
        },
        couponCode: couponCode.trim(),
      });
      if (aborted !== undefined) {
        if (aborted.error instanceof CartEmpty) {
          setCheckoutError("Your cart is empty.");
        } else if (aborted.error instanceof InvalidCoupon) {
          setCheckoutError("That coupon code is not valid.");
          setCouponValid(false);
        } else {
          setCheckoutError("Checkout failed. Please try again.");
        }
        return;
      }
      if (response) {
        app?.sendMessage({
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Order placed! Show my order " +
                `confirmation for order ` +
                `${response.orderId}`,
            },
          ],
        });
      }
    } finally {
      setIsPending(false);
    }
  };

  const canCheckout =
    items.length > 0 && addressValid && couponValid && !isPending;

  if (isLoading && items.length === 0) {
    return (
      <div className={css.container}>
        <div className={css.loading}>Loading cart...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={css.container}>
        <h1 className={css.title}>Shopping Cart</h1>
        <div className={css.empty}>
          Your cart is empty. Browse the store to add items!
        </div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <h1 className={css.title}>Shopping Cart</h1>

      <div className={css.items}>
        {items.map((item) => (
          <div key={item.productId} className={css.item}>
            {item.imageUrl && (
              <img
                className={css.itemImage}
                src={item.imageUrl}
                alt={item.name}
              />
            )}
            <div className={css.itemInfo}>
              <span className={css.itemName}>
                {item.name}
                {item.size && ` (${item.size})`}
              </span>
              <span className={css.itemQty}>Qty: {item.quantity}</span>
            </div>
            <span className={css.itemPrice}>
              {formatPrice(item.priceCents * item.quantity)}
            </span>
            <button
              className={css.removeButton}
              onClick={() => handleRemove(item.productId)}
            >
              x
            </button>
          </div>
        ))}
      </div>

      <div className={css.totals}>
        <div className={css.totalRow}>
          <span>Subtotal</span>
          <span>{formatPrice(subtotalCents)}</span>
        </div>
        {couponValid && (
          <div className={css.totalRow}>
            <span>Coupon discount</span>
            <span className={css.discount}>-{formatPrice(subtotalCents)}</span>
          </div>
        )}
        <div className={`${css.totalRow} ${css.totalFinal}`}>
          <span>Total</span>
          <span>{formatPrice(totalCents)}</span>
        </div>
      </div>

      <div className={css.payment}>
        <h2 className={css.sectionTitle}>Shipping Address</h2>
        <div className={css.form}>
          <div className={css.fieldCol}>
            <input
              className={css.input}
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => markTouched("name")}
              aria-invalid={!!errorFor("name")}
            />
            {errorFor("name") && (
              <div className={css.fieldError}>{errorFor("name")}</div>
            )}
          </div>
          <div className={css.fieldCol}>
            <input
              className={css.input}
              type="email"
              placeholder="Email (for shipping updates)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => markTouched("email")}
              aria-invalid={!!errorFor("email")}
            />
            {errorFor("email") && (
              <div className={css.fieldError}>{errorFor("email")}</div>
            )}
          </div>
          <div className={css.fieldCol}>
            <input
              className={css.input}
              type="text"
              placeholder="Address line 1"
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
              onBlur={() => markTouched("address1")}
              aria-invalid={!!errorFor("address1")}
            />
            {errorFor("address1") && (
              <div className={css.fieldError}>{errorFor("address1")}</div>
            )}
          </div>
          <input
            className={css.input}
            type="text"
            placeholder="Address line 2 (optional)"
            value={address2}
            onChange={(e) => setAddress2(e.target.value)}
          />
          <div className={css.row}>
            <div className={css.fieldCol}>
              <input
                className={css.input}
                type="text"
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onBlur={() => markTouched("city")}
                aria-invalid={!!errorFor("city")}
              />
              {errorFor("city") && (
                <div className={css.fieldError}>{errorFor("city")}</div>
              )}
            </div>
            <div className={css.fieldCol}>
              <input
                className={css.input}
                type="text"
                placeholder="State"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value.toUpperCase())}
                onBlur={() => markTouched("stateCode")}
                aria-invalid={!!errorFor("stateCode")}
                maxLength={2}
              />
              {errorFor("stateCode") && (
                <div className={css.fieldError}>{errorFor("stateCode")}</div>
              )}
            </div>
          </div>
          <div className={css.row}>
            <div className={css.fieldCol}>
              <input
                className={css.input}
                type="text"
                placeholder="ZIP code"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                onBlur={() => markTouched("zipCode")}
                aria-invalid={!!errorFor("zipCode")}
                maxLength={10}
              />
              {errorFor("zipCode") && (
                <div className={css.fieldError}>{errorFor("zipCode")}</div>
              )}
            </div>
            <div className={css.fieldCol}>
              <input
                className={css.input}
                type="text"
                placeholder="Country (US)"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                onBlur={() => markTouched("countryCode")}
                aria-invalid={!!errorFor("countryCode")}
                maxLength={2}
              />
              {errorFor("countryCode") && (
                <div className={css.fieldError}>{errorFor("countryCode")}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={css.couponSection}>
        <h2 className={css.sectionTitle}>Coupon Code</h2>
        <div className={css.couponRow}>
          <input
            className={css.input}
            type="text"
            placeholder="Enter coupon code"
            value={couponCode}
            onChange={(e) => {
              setCouponCode(e.target.value);
              setCouponValid(false);
              setCouponError("");
            }}
          />
          <button
            className={css.applyButton}
            onClick={handleApplyCoupon}
            disabled={applyingCoupon || !couponCode.trim()}
          >
            {applyingCoupon ? "..." : "Apply"}
          </button>
        </div>
        {couponValid && (
          <div className={css.couponSuccess}>
            Coupon applied! Your order is free.
          </div>
        )}
        {couponError && <div className={css.couponErrorMsg}>{couponError}</div>}
      </div>

      <button
        className={css.checkoutButton}
        onClick={handleCheckout}
        disabled={!canCheckout}
      >
        {isPending
          ? "Processing..."
          : couponValid
          ? "Place Order - FREE"
          : "Enter a valid coupon to order"}
      </button>
      {checkoutError && (
        <div className={css.couponErrorMsg}>{checkoutError}</div>
      )}
    </div>
  );
};
