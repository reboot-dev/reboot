"""Printful API client for fetching sync products and
creating orders."""

import asyncio
import httpx
import logging
import os
import time
from reboot_swag_store.v1.store import Product, ShippingAddress, Variant

logger = logging.getLogger(__name__)

PRINTFUL_API_URL = "https://api.printful.com"

# Environment variable that holds the Printful API token.
# Locally read from `.env` (see `.env.example`).
PRINTFUL_API_TOKEN_ENV = "PRINTFUL_API_TOKEN"

# Process-local TTL cache for `fetch_products`. Printful's
# rate limits are tight (429s land quickly) and the catalog
# changes rarely, so we serve repeated reads from memory and
# refetch at most every `_PRODUCTS_TTL_SECONDS`. The lock
# coalesces concurrent first-fetchers so we make at most one
# upstream request per cold cache.
_PRODUCTS_TTL_SECONDS = 60.0
_products_cache: tuple[float, list[Product]] | None = None
_products_lock = asyncio.Lock()


def _get_token() -> str:
    """Read the Printful API token from the environment."""
    value = os.environ.get(PRINTFUL_API_TOKEN_ENV)
    if not value:
        raise RuntimeError(
            f"`{PRINTFUL_API_TOKEN_ENV}` is not set. Locally,"
            " copy `.env.example` to `.env` and fill it in."
        )
    return value


def _extract_size_color(
    sync_variant: dict,
) -> tuple[str, str]:
    """Extract (size, color) from a Printful sync variant.

    Prefers the structured fields on `product` (the catalog
    variant) when present, and falls back to splitting the
    sync variant name on "/". The name fallback handles
    three shapes:
      - "Product / Color / Size"    -> color, size
      - "Product / Size"            -> size if a known size
      - "Product / Color"           -> color otherwise
    """
    catalog = sync_variant.get("product", {}) or {}
    size = (catalog.get("size") or "").strip()
    color = (catalog.get("color") or "").strip()
    if size or color:
        return size, color

    parts = [p.strip() for p in sync_variant.get("name", "").split("/")]
    if len(parts) >= 3:
        return parts[2], parts[1]
    if len(parts) == 2:
        label = parts[1]
        if label.upper() in _KNOWN_SIZES:
            return label, ""
        return "", label
    return "", ""


_KNOWN_SIZES = frozenset(
    [
        "XS",
        "S",
        "M",
        "L",
        "XL",
        "2XL",
        "3XL",
        "4XL",
        "5XL",
        "ONE SIZE",
    ]
)


async def fetch_products() -> list[Product]:
    """Fetch all sync products from Printful and convert
    them to the store's `Product` model.

    Results are memoized for `_PRODUCTS_TTL_SECONDS` to
    keep us under Printful's rate limit; concurrent callers
    that arrive while the cache is cold share a single
    upstream fetch via `_products_lock`.

    Printful's v1 API requires a separate detail call per
    product to get variants and pricing, so we fan out the
    detail requests concurrently with `asyncio.gather` to
    keep page load snappy.
    """
    global _products_cache
    now = time.monotonic()
    if _products_cache is not None:
        cached_at, cached = _products_cache
        if now - cached_at < _PRODUCTS_TTL_SECONDS:
            return cached

    async with _products_lock:
        # Re-check inside the lock: another coroutine may
        # have populated the cache while we were waiting.
        now = time.monotonic()
        if _products_cache is not None:
            cached_at, cached = _products_cache
            if now - cached_at < _PRODUCTS_TTL_SECONDS:
                return cached
        products = await _fetch_products_uncached()
        _products_cache = (time.monotonic(), products)
        return products


async def _fetch_products_uncached() -> list[Product]:
    token = _get_token()
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{PRINTFUL_API_URL}/store/products",
            headers=headers,
        )
        response.raise_for_status()
        data = response.json()

        summaries = [
            (item, item.get("sync_product", item))
            for item in data.get("result", [])
        ]
        details = await asyncio.gather(
            *[
                _fetch_product_detail(
                    str(sync.get("id", "")), headers, client
                ) for _, sync in summaries
            ]
        )

    products: list[Product] = []
    for (_, sync_product), detail in zip(summaries, details):
        product_id = str(sync_product.get("id", ""))
        name = sync_product.get("name", "Unnamed Product")
        thumbnail_url = sync_product.get("thumbnail_url", "")
        products.append(
            Product(
                id=product_id,
                name=name,
                description=detail.get("description", name),
                price_cents=detail.get("price_cents", 0),
                image_url=thumbnail_url,
                variants=detail.get("variants", []),
            )
        )

    logger.info("Fetched %d products from Printful.", len(products))
    return products


async def _fetch_product_detail(
    product_id: str,
    headers: dict[str, str],
    client: httpx.AsyncClient,
) -> dict:
    """Fetch detail for a single sync product, returning
    a dict with `description`, `price_cents`, and
    `variants`."""
    response = await client.get(
        f"{PRINTFUL_API_URL}/store/products/{product_id}",
        headers=headers,
    )
    response.raise_for_status()
    data = response.json()

    result = data.get("result", {})
    sync_product = result.get("sync_product", {})
    sync_variants = result.get("sync_variants", [])

    # Use the first variant's retail price as the
    # product price.
    price_cents = 0
    if sync_variants:
        retail = sync_variants[0].get("retail_price")
        if retail:
            price_cents = int(float(retail) * 100)

    # Printful doesn't have a description field on sync
    # products, so we build one from the product name.
    product_name = sync_product.get("name", "")
    product_type = ""

    # Get the underlying Printful catalog product info.
    product_info = (
        sync_variants[0].get("product", {}) if sync_variants else {}
    )
    if product_info:
        product_type = product_info.get("name", "")

    description = product_name
    if product_type and product_type != product_name:
        description = (f"{product_name} - {product_type}")

    # Build variants list.
    variants: list[Variant] = []
    for sv in sync_variants:
        variant_id = str(sv.get("id", ""))
        size, color = _extract_size_color(sv)

        sv_price = sv.get("retail_price")
        sv_price_cents = (
            int(float(sv_price) * 100) if sv_price else price_cents
        )

        # Get the preview image for this variant.
        variant_image = ""
        for file_info in sv.get("files", []):
            if file_info.get("type") == "preview":
                variant_image = file_info.get(
                    "preview_url",
                    file_info.get("thumbnail_url", ""),
                )
                break
        if not variant_image:
            variant_image = sv.get("product", {}).get("image", "")

        variants.append(
            Variant(
                id=variant_id,
                size=size,
                color=color,
                price_cents=sv_price_cents,
                image_url=variant_image,
            )
        )

    return {
        "description": description,
        "price_cents": price_cents,
        "variants": variants,
    }


async def create_order(
    items: list[dict],
    shipping: ShippingAddress,
    external_id: str = "",
) -> dict:
    """Create a Printful order.

    `items` should be a list of dicts with keys
    `variant_id` (sync variant ID) and `quantity`.

    `external_id` is used by Printful to deduplicate
    retried requests.

    Returns the Printful order response dict.
    """
    token = _get_token()
    headers = {"Authorization": f"Bearer {token}"}

    order_items = []
    for item in items:
        order_items.append(
            {
                "sync_variant_id": int(item["variant_id"]),
                "quantity": item["quantity"],
            }
        )

    recipient = {
        "name": shipping.name,
        "address1": shipping.address1,
        "city": shipping.city,
        "state_code": shipping.state_code,
        "zip": shipping.zip_code,
        "country_code": shipping.country_code,
    }
    if shipping.address2:
        recipient["address2"] = shipping.address2
    if shipping.email:
        recipient["email"] = shipping.email

    payload = {
        "recipient": recipient,
        "items": order_items,
    }
    if external_id:
        payload["external_id"] = (external_id.replace("-", ""))

    logger.info("Printful order payload: %s", payload)

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PRINTFUL_API_URL}/orders",
            headers=headers,
            json=payload,
            timeout=60.0,
        )
        if response.status_code >= 400:
            body = response.json()
            error_code = (body.get("error", {}).get("api_error_code", ""))
            # OR-13: "Order with this External ID
            # already exists" — treat as success
            # (idempotent retry).
            if error_code == "OR-13":
                logger.info(
                    "Printful order already exists "
                    "(external_id=%s), treating as "
                    "success.",
                    external_id,
                )
                return body.get("result", {})
            logger.error(
                "Printful order failed (%d): %s",
                response.status_code,
                response.text,
            )
        response.raise_for_status()
        data = response.json()

    logger.info(
        "Created Printful order: %s",
        data.get("result", {}).get("id"),
    )
    return data.get("result", {})
