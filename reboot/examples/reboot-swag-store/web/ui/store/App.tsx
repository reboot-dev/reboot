import { useState, useMemo, useCallback, type FC } from "react";
import { useUser } from "@api/reboot_swag_store/v1/store_rbt_react";
import { useMcpApp, useMcpToolData } from "@reboot-dev/reboot-react";
import css from "./App.module.css";

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type ButtonState = "idle" | "loading" | "done";

const AddToCartButton: FC<{
  onClick: () => Promise<void>;
  disabled?: boolean;
}> = ({ onClick, disabled }) => {
  const [state, setState] = useState<ButtonState>("idle");

  const handleClick = useCallback(async () => {
    if (state !== "idle") return;
    setState("loading");
    try {
      await onClick();
      setState("done");
      setTimeout(() => setState("idle"), 1200);
    } catch {
      setState("idle");
    }
  }, [onClick, state]);

  return (
    <button
      className={`${css.addButton} ${
        state !== "idle" ? css.addButtonBusy : ""
      }`}
      onClick={handleClick}
      disabled={disabled || state !== "idle"}
    >
      {state === "loading" && <span className={css.spinner} />}
      {state === "done" && <span className={css.check}>&#10003;</span>}
      {state === "idle" && "Add to Cart"}
    </button>
  );
};

type VariantType = {
  id: string;
  size: string;
  color: string;
  priceCents: number;
  imageUrl: string;
};

type ProductCardProps = {
  product: {
    id: string;
    name: string;
    description: string;
    priceCents: number;
    imageUrl: string;
    variants: VariantType[];
  };
  onAdd: (variantId: string) => Promise<void>;
};

const ProductCard: FC<ProductCardProps> = ({ product, onAdd }) => {
  const variants = product.variants;

  // Get unique colors and sizes.
  const colors = useMemo(
    () => [...new Set(variants.map((v) => v.color).filter(Boolean))],
    [variants]
  );
  const sizes = useMemo(
    () => [...new Set(variants.map((v) => v.size).filter(Boolean))],
    [variants]
  );

  const hasColors = colors.length > 1;
  const hasSizes = sizes.length > 1;

  // Pre-select the first color and first size.
  const [selectedColor, setSelectedColor] = useState(colors[0] ?? "");
  const [selectedSize, setSelectedSize] = useState(sizes[0] ?? "");

  // Find the matching variant.
  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return null;
    if (variants.length === 1) return variants[0];
    return (
      variants.find(
        (v) =>
          (!hasColors || v.color === selectedColor) &&
          (!hasSizes || v.size === selectedSize)
      ) ?? variants[0]
    );
  }, [variants, selectedColor, selectedSize, hasColors, hasSizes]);

  // Find the image for the selected color (first
  // variant with that color that has an image).
  const displayImage = useMemo(() => {
    if (hasColors) {
      const colorVariant = variants.find(
        (v) => v.color === selectedColor && v.imageUrl
      );
      if (colorVariant) return colorVariant.imageUrl;
    }
    return selectedVariant?.imageUrl || product.imageUrl;
  }, [variants, selectedColor, selectedVariant, hasColors, product.imageUrl]);

  return (
    <div className={css.card}>
      {displayImage && (
        <img
          className={css.productImage}
          src={displayImage}
          alt={product.name}
        />
      )}
      <div className={css.info}>
        <h3 className={css.name}>{product.name}</h3>
        <p className={css.description}>{product.description}</p>
        {hasColors && (
          <div className={css.colorRow}>
            {colors.map((color) => (
              <button
                key={color}
                className={`${css.colorButton} ${
                  selectedColor === color ? css.colorSelected : ""
                }`}
                onClick={() => setSelectedColor(color)}
              >
                {color}
              </button>
            ))}
          </div>
        )}
        {hasSizes && (
          <select
            className={css.sizeSelect}
            value={selectedSize}
            onChange={(e) => setSelectedSize(e.target.value)}
          >
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        )}
        <div className={css.cardFooter}>
          <span className={css.price}>
            {formatPrice(selectedVariant?.priceCents ?? product.priceCents)}
          </span>
          <AddToCartButton
            disabled={!selectedVariant}
            onClick={() => onAdd(selectedVariant!.id)}
          />
        </div>
      </div>
    </div>
  );
};

export const StoreApp: FC = () => {
  const app = useMcpApp();
  const user = useUser();
  // The MCP host merges the tool's input arguments into
  // `toolData`, so a call of `browse_store({"product_ids":
  // ["abc", "def"]})` lands at `toolData.product_ids`. The
  // model picks these IDs after reading the catalog from
  // `list_products`; an empty (or missing) list means show
  // everything.
  const toolData = useMcpToolData();
  const productIds = useMemo<string[]>(
    () =>
      Array.isArray(toolData?.product_ids)
        ? toolData.product_ids.filter(
            (id): id is string => typeof id === "string"
          )
        : [],
    [toolData]
  );
  const { response, isLoading } = user.useListProducts();

  const allProducts = response?.products ?? [];
  // Filter client-side to the IDs the model selected. Drop
  // unknown IDs silently — models will occasionally
  // hallucinate one, and a missing match is better UX than
  // an error.
  const products = useMemo(() => {
    if (productIds.length === 0) return allProducts;
    const wanted = new Set(productIds);
    return allProducts.filter((product) => wanted.has(product.id));
  }, [allProducts, productIds]);

  if (isLoading && allProducts.length === 0) {
    return (
      <div className={css.container}>
        <div className={css.loading}>Loading store...</div>
      </div>
    );
  }

  const isFiltered = productIds.length > 0;

  return (
    <div className={css.container}>
      <h1 className={css.title}>Reboot Swag Store</h1>
      <p className={css.subtitle}>
        {isFiltered
          ? `Showing ${products.length} of ${allProducts.length} products`
          : "Official Reboot merch"}
      </p>
      <div className={css.grid}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAdd={async (variantId) => {
              const variant = product.variants.find((v) => v.id === variantId);
              await app?.sendMessage({
                role: "user",
                content: [
                  {
                    type: "text",
                    text:
                      `Add to my cart: ` +
                      `product_id="${product.id}", ` +
                      `variant_id="${variantId}", ` +
                      `name="${product.name}", ` +
                      `price_cents=${
                        variant?.priceCents ?? product.priceCents
                      }, ` +
                      `image_url="${variant?.imageUrl || product.imageUrl}", ` +
                      `size="${variant?.size ?? ""}"`,
                  },
                ],
              });
            }}
          />
        ))}
      </div>
    </div>
  );
};
