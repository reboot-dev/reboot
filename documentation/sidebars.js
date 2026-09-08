/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    {
      type: "doc",
      id: "overview",
      label: "Overview",
    },
    {
      type: "category",
      collapsed: false,
      label: "Get started",
      items: [
        {
          type: "doc",
          id: "get_started/claude_code",
          label: "Build with Claude Code",
        },
        {
          type: "doc",
          id: "get_started/codex",
          label: "Build with Codex",
        },
        {
          type: "category",
          collapsed: true,
          label: "Step by step",
          items: [
            {
              type: "doc",
              id: "get_started/python",
              label: "Python backend",
            },
            {
              type: "doc",
              id: "get_started/typescript",
              label: "TypeScript backend",
            },
            {
              type: "doc",
              id: "get_started/react",
              label: "React frontend",
            },
          ],
        },
        {
          type: "doc",
          id: "get_started/quickstart",
          label: "Quickstart (hand-written AI chat app)",
        },
        {
          type: "doc",
          id: "get_started/examples",
          label: "Examples",
        },
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "AI chat apps",
      items: [
        {
          type: "doc",
          id: "ai_chat_apps/get_started_claude_code",
          label: "Get started (with Claude Code)",
        },
        {
          type: "doc",
          id: "ai_chat_apps/get_started_codex",
          label: "Get started (with Codex)",
        },
        {
          type: "doc",
          id: "ai_chat_apps/examples",
          label: "Examples",
        },
      ],
    },
    {
      type: "doc",
      id: "concepts",
      label: "How Reboot works",
    },
    {
      type: "category",
      collapsed: true,
      label: "Users and auth",
      items: [
        {
          type: "doc",
          id: "users/overview",
          label: "Users and sign-in",
        },
        {
          type: "doc",
          id: "users/oauth",
          label: "Configure OAuth",
        },
        {
          type: "doc",
          id: "users/providers",
          label: "OAuth providers",
        },
        {
          type: "doc",
          id: "users/claims",
          label: "Identity claims",
        },
        {
          type: "doc",
          id: "users/authorization",
          label: "Authorization",
        },
        {
          type: "doc",
          id: "users/tokens",
          label: "Bearer tokens",
        },
        {
          type: "doc",
          id: "users/external_apis",
          label: "Call external APIs as the user",
        },
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "One backend, many frontends",
      items: [
        {
          type: "doc",
          id: "surfaces/overview",
          label: "Overview",
        },
        {
          type: "doc",
          id: "surfaces/web",
          label: "Web apps",
        },
        {
          type: "doc",
          id: "surfaces/react_native",
          label: "React Native apps",
        },
        {
          type: "doc",
          id: "surfaces/ai_chat",
          label: "AI chat apps",
        },
        {
          type: "doc",
          id: "surfaces/ui_methods",
          label: "UI methods",
        },
        {
          type: "doc",
          id: "agents",
          label: "Agents inside your app",
        },
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "Define your API",
      items: [
        "define/overview",
        "define/methods",
        "define/pydantic",
        "define/zod",
        "define/protobuf",
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "Implement your API",
      items: [
        "implement/servicers",
        "implement/readers",
        "implement/writers",
        "implement/transactions",
        "implement/workflows",
        {
          type: "doc",
          id: "implement/application",
          label: "Run your application",
        },
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "Call your API",
      items: [
        "call/overview",
        "call/from_react",
        "call/from_within_your_app",
        "call/from_outside_your_app",
        "call/via_http",
        "call/from_mcp_client",
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "Going further",
      items: [
        "tasks",
        "side_effects",
        "idempotency",
        "errors",
        "secrets",
        "testing",
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "Standard library",
      items: [
        "library_services/overview",
        "library_services/ciphertext",
        "library_services/mailgun",
        "library_services/oauth_token_manager",
        "library_services/ordered_map",
        "library_services/pubsub",
        "library_services/queue",
        "library_services/sorted_map",
        "library_services/item",
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "Develop and deploy",
      items: [
        {
          type: "doc",
          id: "develop_locally",
          label: "Develop locally",
        },
        {
          type: "doc",
          id: "nonlocal",
          label: "Non-local development",
        },
        {
          type: "doc",
          id: "rbt_cli",
          label: "The rbt CLI",
        },
        {
          type: "doc",
          id: "deploy_on_reboot_cloud",
          label: "Deploy on Reboot Cloud",
        },
        {
          type: "doc",
          id: "deploy_on_your_own",
          label: "Deploy on your own",
        },
        {
          type: "doc",
          id: "upgrade",
          label: "Upgrade Reboot",
        },
        {
          type: "doc",
          id: "known_issues",
          label: "Known issues",
        },
      ],
    },
    // {
    //   type: "category",
    //   label: "Deploy & operate",
    //   items: ["deploy_operate/import_export"],
    // },
    // TODO: #3363.
  ],
};

module.exports = sidebars;
