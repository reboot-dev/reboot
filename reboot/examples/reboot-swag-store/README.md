# Reboot Store

An MCP shopping experience for Reboot-branded swag, built with
[Reboot](https://docs.reboot.dev/) and backed by
[Printful](https://www.printful.com/) for real product data and
on-demand fulfillment.

For the impatient:

1. [Set up your environment](#set-up-your-environment)
2. [Configure Printful and secrets](#configure-printful-and-secrets)
3. [Run the application](#run-the-application)
4. [Generate a coupon code](#generate-a-coupon-code)
5. [Connect an MCP client](#connect-an-mcp-client)
6. [Running the tests](#running-the-tests)
7. [Deploy to Reboot Cloud](#deploy-to-reboot-cloud)

## Overview

The Reboot Store is an AI Chat App (MCP App) that lets users browse
products, manage a shopping cart, and check out — all through an AI
chat interface. It exposes three interactive UIs:

- **Store** — a product grid showing the products the model
  picked for the current request, with color and size selection
  per product.
- **Cart** — a cart view with item management, totals, a shipping
  address form, and a coupon code field.
- **Order Confirmation** — a receipt view after a successful
  purchase.

The backend uses Reboot's durable state to persist carts, coupon
codes, and orders across restarts. Product data is fetched live
from Printful on each `list_products` call. Anonymous auth
generates a unique user identity per MCP session.

Filtering is **AI-driven**, using a *data tool + widget tool*
split. `list_products` returns the full catalog with no server-
side filter; the client model reads it, picks the IDs whose
name or description match the user's intent, and then opens
`browse_store` with those `product_ids`. The widget filters
the cached catalog client-side to that subset. This pushes
natural-language understanding to the model — no regex,
stopwords, or synonym lists in the backend — and copes with any
phrasing ("show me hats", "what cold-weather gear do you have",
"the navy ones") that the model can interpret.

> ⚠️ **Printful places real orders.** When a checkout completes,
> this app calls the Printful `POST /orders` endpoint. Use a
> Printful store in **draft mode** (or a sandbox account) while
> developing so no merch actually ships.

### Project structure

```
reboot-swag-store/
├── api/reboot_swag_store/v1/
│   └── store.py              # State models and API definition
├── backend/src/
│   ├── main.py               # Application entrypoint
│   ├── constants.py          # Shared constants
│   ├── printful.py           # Printful API client
│   └── servicers/
│       └── store.py          # Servicer implementations
└── web/
    ├── index.css             # Shared theme
    └── ui/
        ├── store/            # Store browse UI
        ├── cart/             # Shopping cart UI
        └── confirmation/     # Order confirmation UI
```

### State model

- **User** — per-MCP-session entry point. Methods to browse the
  store (`browse_store` UI, `list_products`) and create a cart
  (`create_cart`). All auto-exposed as MCP tools.
- **Cart** — per-user cart. Methods to `add_item`, `remove_item`,
  `get_cart`, `show_cart` (UI), and `checkout`.
- **CouponBook** — singleton (id `coupon-book`) that holds a pool
  of single-use coupon codes. Exposes `generate_codes` (admin
  only), `validate_code`, and `redeem_code`. On first startup, 20
  codes are generated automatically.
- **Order** — created on checkout. Stores receipt details and
  runs a `fulfill` workflow that places the Printful order
  at-least-once.

## Set up your environment

### Prerequisites

- Python >= 3.10
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Node.js and npm
- A [Printful](https://www.printful.com/) account with at least
  one sync product

### Install dependencies

From the `reboot-swag-store/` directory:

```sh
uv sync
```

```sh
cd web && npm install && cd ..
```

### Generate code

```sh
uv run rbt generate
```

## Configure Printful and secrets

1. Create a Printful store (use **draft mode** during
   development).
2. Add at least one sync product so `list_products` has
   something to return.
3. Create a Printful API token at
   <https://www.printful.com/dashboard/developer/api-keys>.
4. Copy `.env.example` to `.env` and fill in the values:

   ```sh
   cp .env.example .env
   ```

   ```sh
   # .env
   PRINTFUL_API_TOKEN=your_printful_api_token_here
   STORE_ADMIN_KEY=pick-any-secret-string
   ```

   The backend reads these env vars at request time. In
   Reboot Cloud, the same names are injected via `rbt cloud
   secret set` (see "Deploy to Reboot Cloud" below), so the
   same code works in both environments.

   `STORE_ADMIN_KEY` is an app-local secret used to gate the
   `generate_codes` endpoint. Pick any value; you'll pass it
   as a bearer token when you generate coupon codes (see
   below).

## Run the application

You need two terminals, both starting from the `reboot-swag-store/`
directory.

**Terminal 1 — backend:**

```sh
uv run rbt dev run
```

This starts the Reboot backend and watches for file changes. See
`.rbtrc` for the full set of flags.

**Terminal 2 — frontend (HMR):**

```sh
cd web && npm run dev
```

This starts the Vite dev server with hot module replacement. The
backend proxies UI requests to Vite via Envoy.

## Generate a coupon code

Checkout requires a valid coupon code, which makes the order
free. Twenty codes are generated the first time the backend
starts; you can view them (and mint more) via the Reboot inspect
dashboard and a short `curl` call.

### View existing codes

Open the inspect dashboard at
<http://localhost:9991/__/inspect>. In the **States** tab:

1. Select the `reboot_swag_store.v1.CouponBook` state type.
2. Click the `coupon-book` instance.
3. The `codes` field lists every unused code.

Pick any code from that list to use at checkout.

### Mint new codes

`CouponBook.generate_codes` is not exposed as an MCP tool — it's
an admin operation. Call it over HTTP with your admin key as a
bearer token:

```sh
curl -XPOST http://localhost:9991/reboot_swag_store.v1.CouponBookMethods/GenerateCodes \
  -H "x-reboot-state-ref: reboot_swag_store.v1.CouponBook:coupon-book" \
  -H "Authorization: Bearer $STORE_ADMIN_KEY" \
  -d '{}'
```

The response contains 20 new six-digit codes. They're also
appended to the `CouponBook` state visible in the inspect
dashboard.

## Connect an MCP client

Once the app is running, open <http://localhost:9991> and
follow the setup wizard to connect a chat host (such as Claude
or ChatGPT) to the app.

### Try it out

Once connected, try these prompts (substitute one of your coupon
codes for `123456`):

- "Show me what's in the store."
- "Show me only the hats."
- "Create a cart and add the Reboot Hoodie in size L."
- "Show me my cart."
- "Check out. Ship to Jane Doe, 123 Main St, Seattle WA 98101,
  US, jane@example.com. Use coupon code 123456."
- "Show me the confirmation for my order."

## Running the tests

```sh
cd backend && uv run pytest
```

The suite has two files:

- `backend/tests/printful_helpers_test.py` — pure-function
  tests for the variant-parsing helper. Fast, no Reboot
  runtime.
- `backend/tests/store_servicer_test.py` — integration tests
  that spin up an in-process Reboot, set the admin-key env
  var to a known test value, and swap `OrderServicer.fulfill`
  for a no-op so tests don't hit Printful. Covers cart
  add/remove/checkout, `CartEmpty` / `InvalidCoupon` aborts,
  coupon single-use, the admin-gated `generate_codes`
  endpoint, and the `list_products` "full catalog, no server-
  side filter" contract (using a stubbed `fetch_products`).

## Deploy to Reboot Cloud

The repo includes a `Dockerfile` and `rbt serve` / `rbt cloud`
configuration so the same code you ran locally can be deployed
to [Reboot Cloud](https://cloud.reboot.dev/). You'll need an
invitation + API key — sign up at <https://cloud.reboot.dev/>.

### 1. Upload secrets

The backend reads `PRINTFUL_API_TOKEN` and `STORE_ADMIN_KEY`
from its environment. In the cloud, set them once with `rbt
cloud secret set`; Cloud injects each one into the application's
environment under its given name:

```sh
uv run rbt cloud secret set \
  --api-key=YOUR_API_KEY \
  --application-name=reboot-swag-store \
  PRINTFUL_API_TOKEN=YOUR_PRINTFUL_TOKEN \
  STORE_ADMIN_KEY=YOUR_ADMIN_KEY
```

### 2. Bring the application up

`rbt cloud up` builds the `Dockerfile` in this directory and
deploys the resulting image:

```sh
uv run rbt cloud up --api-key=YOUR_API_KEY
```

The flags `--name=reboot-swag-store`, `--dockerfile=Dockerfile`, and
friends come from `.rbtrc`. The output prints the URL of the
deployed application; point your MCP client at `<URL>/mcp`.

### 3. Inspect, tail logs, or tear down

```sh
# The inspect dashboard works against Cloud too:
#   <YOUR_URL>/__/inspect

uv run rbt cloud logs --api-key=YOUR_API_KEY
uv run rbt cloud down --api-key=YOUR_API_KEY  # keep state
uv run rbt cloud down --api-key=YOUR_API_KEY --expunge  # wipe
```

Fresh deploys will regenerate the initial 20 coupon codes on
first start; existing deploys persist codes (and carts, orders,
etc.) across `rbt cloud up` redeploys until you pass
`--expunge`.

## Resetting state

To wipe all local persisted state (carts, coupons, orders,
etc.):

```sh
uv run rbt dev expunge --name=reboot-swag-store
```

The next `rbt dev run` will regenerate the initial 20 coupon
codes.
