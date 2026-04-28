# Chick-potle

An AI Chat App built with Reboot that demonstrates a small
food-ordering flow driven from inside an AI chat client.
The AI calls tools to start an order, browse the menu, and
add or remove items; humans see two embedded React UIs — a
menu grid and a cart — rendered alongside the conversation.

## State model

- **`User`** — per-user entry point. Auto-constructed for
  each authenticated chat user; exposes `start_order`,
  which atomically creates a fresh `FoodOrder` (with the
  pre-populated menu) and returns its ID.
- **`FoodOrder`** — one ordering session. Holds a `menu`
  (the list of items the AI can offer) and a `cart` (the
  items the user has added so far, with quantities). The
  cart's running total is recomputed from the menu on read,
  so item prices stay in sync if the menu is ever updated.

The user-facing flow is:

1. The AI calls `User.start_order` and gets back an order
   ID.
2. It calls `FoodOrder.show_menu` to open the menu UI in
   the chat, where the user can browse items.
3. As the conversation continues, the AI calls
   `add_to_cart` / `remove_from_cart` (or the user clicks
   "+ Add" buttons in the menu UI), and `show_cart` opens
   the cart UI to display the running total.

`get_menu`, `get_cart`, `add_to_cart`, and `remove_from_cart`
are exposed as MCP tools, so an MCP-aware AI client can
drive the order programmatically.

## Quick start

```bash
# Install Python dependencies and create the virtualenv.
rye sync
source .venv/bin/activate

# Install web dependencies.
cd web && npm install && cd ..

# Generate API code (Python + React bindings).
rbt generate

# Build the React UIs.
cd web && npm run build && cd ..
```

Then run the app (each command in its own terminal, from the
project directory, with `.venv` activated):

```bash
# Terminal 1: start the Reboot backend.
rbt dev run

# Terminal 2: start the Vite dev server for Hot Module Replacement.
cd web && npm run dev
```

State persists between restarts under the name `chick-potle`
(configured in `.rbtrc`). To wipe it:

```bash
rbt dev expunge --application-name=chick-potle
```

## Running the tests

The backend has an in-process test suite that exercises the
`User` and `FoodOrder` servicers via direct Reboot calls —
no MCP client, no browser, no external services.

```bash
rye sync
source .venv/bin/activate
pytest backend/
```

## Testing with MCPJam Inspector

`mcp_servers.json` is pre-configured. In another terminal:

```bash
npx @mcpjam/inspector@v2.4.0 --config mcp_servers.json --server chick-potle
```

Try these prompts to exercise each capability:

1. `Start a new food order.` — exercises `start_order`,
   which creates a `FoodOrder` for this user and returns
   its ID.
2. `Show me the menu.` — exercises `show_menu` and renders
   the menu UI in the chat.
3. `Add a Chicken Burrito and two Mexican Coca-Colas to my
   cart.` — exercises `add_to_cart` (the AI looks up the
   matching `item_index` from `get_menu`).
4. `What's in my cart?` — exercises `get_cart` and
   `show_cart`; the rendered UI lists each line item with
   the running total.
5. `Remove the Coca-Colas.` — exercises `remove_from_cart`.

## Project layout

```
chick-potle/
├── api/ai_chat_food/v1/food.py   # State models + method declarations.
├── backend/
│   ├── api/                      # Generated Python bindings.
│   └── src/
│       ├── main.py               # Application entrypoint.
│       └── servicers/food.py     # User and FoodOrder servicers.
└── web/
    ├── api/                      # Generated React bindings.
    └── ui/
        ├── menu/                 # Menu grid UI.
        └── cart/                 # Cart UI.
```

## Learn more

- [Reboot Documentation](https://docs.reboot.dev)
- [MCP Specification](https://modelcontextprotocol.io)
