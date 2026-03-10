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
      label: "AI Chat Apps",
      items: [
        "ai_chat_apps/what_is",
        {
          type: "doc",
          id: "ai_chat_apps/get_started_claude_code",
          label: "Get Started (with Claude Code)",
        },
        {
          type: "doc",
          id: "ai_chat_apps/get_started",
          label: "Get Started (hand-written)",
        },
        {
          type: "doc",
          id: "ai_chat_apps/examples",
          label: "Examples",
        },
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "Full-stack apps",
      items: [
        {
          type: "category",
          collapsed: true,
          label: "Get started",
          items: [
            "full_stack_apps/typescript",
            "full_stack_apps/python",
            "full_stack_apps/react",
          ],
        },
        "full_stack_apps/examples",
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "Learn More",
      items: [
        "learn_more/mcp_apps",
        {
          type: "category",
          collapsed: true,
          label: "Define your API",
          items: [
            "learn_more/define/overview",
            "learn_more/define/methods",
            "learn_more/define/pydantic",
            "learn_more/define/zod",
            "learn_more/define/protobuf",
          ],
        },
        {
          type: "category",
          collapsed: true,
          label: "Implement your API",
          items: [
            "learn_more/implement/servicers",
            "learn_more/implement/readers",
            "learn_more/implement/writers",
            "learn_more/implement/transactions",
            "learn_more/implement/workflows",
            {
              type: "doc",
              id: "learn_more/implement/ui_methods",
              label: "UIs for AI Chat Apps",
            },
          ],
        },
        "learn_more/applications",
        {
          type: "category",
          collapsed: true,
          label: "Call your API",
          items: [
            "learn_more/call/overview",
            "learn_more/call/from_react",
            // "learn_more/call/from_browser",
            "learn_more/call/from_within_your_app",
            "learn_more/call/from_outside_your_app",
            "learn_more/call/via_http",
            "learn_more/call/from_mcp_client",
          ],
        },
        "learn_more/testing",
        "learn_more/auth",
        "learn_more/secrets",
        "learn_more/errors",
        "learn_more/tasks",
        "learn_more/side_effects",
        "learn_more/idempotency",
      ],
    },
    {
      type: "category",
      collapsed: true,
      label: "Standard library",
      items: [
        "library_services/overview",
        "library_services/mailgun",
        "library_services/ordered_map",
        "library_services/pubsub",
        "library_services/queue",
        "library_services/sorted_map",
        "library_services/item",
      ],
    },
    {
      type: "doc",
      id: "develop_locally",
      label: "Develop locally",
    },
    "tools/cli",
    {
      type: "doc",
      id: "deploy_on_your_own",
      label: "Deploy on your own",
    },
    {
      type: "doc",
      id: "deploy_on_reboot_cloud",
      label: "Deploy on Reboot Cloud",
    },
    // {
    //   type: "category",
    //   label: "Deploy & operate",
    //   items: ["deploy_operate/where", "deploy_operate/import_export"],
    // },
    // TODO: #3363.

    {
      type: "doc",
      id: "known_issues",
      label: "Known issues",
    },
  ],
};

module.exports = sidebars;
