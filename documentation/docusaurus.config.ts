// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

// const lightCodeTheme = require("prism-react-renderer/themes/github");
// const darkCodeTheme = require("prism-react-renderer/themes/dracula");
const tailwindPlugin = require("./plugins/tailwind-plugin.cjs");

import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

/** @type {import('@docusaurus/types').Config} */
const config: Config = {
  title: "Reboot Docs",
  tagline:
    "A full-stack framework for the AI era: durable applications, correct concurrency, retry safety, and signed-in users.",
  favicon: "img/favicon.svg",

  // Set the production url of your site here
  url: "https://docs.reboot.dev",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "reboot", // Usually your GitHub org/user name.
  projectName: "reboot", // Usually your repo name.

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "throw",

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  plugins: [
    tailwindPlugin,
    [
      "@docusaurus/plugin-client-redirects",
      {
        // Pages that this site published under an older URL. Reboot's
        // own source — generated servicer boilerplate, example
        // READMEs, error messages — links to some of these, as do
        // third parties, so they keep resolving.
        redirects: [
          { from: "/ai_chat_apps/what_is", to: "/surfaces/ai_chat" },
          { from: "/learn_more/mcp_apps", to: "/surfaces/ai_chat" },
          {
            from: "/learn_more/implement/ui_methods",
            to: "/surfaces/ui_methods",
          },
          {
            from: "/ai_chat_apps/get_started",
            to: "/get_started/claude_code",
          },
          { from: "/get_started/quickstart", to: "/get_started/claude_code" },
          {
            from: [
              "/ai_chat_apps/get_started_claude_code",
              "/full_stack_apps/get_started_claude_code",
            ],
            to: "/get_started/claude_code",
          },
          {
            from: [
              "/ai_chat_apps/get_started_codex",
              "/full_stack_apps/get_started_codex",
            ],
            to: "/get_started/codex",
          },
          {
            from: ["/ai_chat_apps/examples", "/full_stack_apps/examples"],
            to: "/get_started/examples",
          },
          { from: "/full_stack_apps/python", to: "/get_started/python" },
          {
            from: "/full_stack_apps/typescript",
            to: "/get_started/typescript",
          },
          { from: "/full_stack_apps/react", to: "/get_started/react" },
          { from: "/learn_more/define/overview", to: "/define/overview" },
          { from: "/learn_more/define/methods", to: "/define/methods" },
          { from: "/learn_more/define/pydantic", to: "/define/pydantic" },
          { from: "/learn_more/define/zod", to: "/define/zod" },
          { from: "/learn_more/define/protobuf", to: "/define/protobuf" },
          {
            from: "/learn_more/implement/servicers",
            to: "/implement/servicers",
          },
          { from: "/learn_more/implement/readers", to: "/implement/readers" },
          { from: "/learn_more/implement/writers", to: "/implement/writers" },
          {
            from: "/learn_more/implement/transactions",
            to: "/implement/transactions",
          },
          {
            from: "/learn_more/implement/workflows",
            to: "/implement/workflows",
          },
          {
            from: "/learn_more/applications",
            to: "/implement/application",
          },
          { from: "/learn_more/call/overview", to: "/call/overview" },
          { from: "/learn_more/call/from_react", to: "/call/from_react" },
          {
            from: "/learn_more/call/from_within_your_app",
            to: "/call/from_within_your_app",
          },
          {
            from: "/learn_more/call/from_outside_your_app",
            to: "/call/from_outside_your_app",
          },
          { from: "/learn_more/call/via_http", to: "/call/via_http" },
          {
            from: "/learn_more/call/from_mcp_client",
            to: "/call/from_mcp_client",
          },
          { from: "/learn_more/auth", to: "/users/authorization" },
          {
            from: "/learn_more/identity_and_external_apis",
            to: "/users/external_apis",
          },
          { from: "/learn_more/tasks", to: "/tasks" },
          { from: "/learn_more/side_effects", to: "/side_effects" },
          { from: "/learn_more/idempotency", to: "/idempotency" },
          { from: "/learn_more/errors", to: "/errors" },
          { from: "/learn_more/agents", to: "/agents" },
          { from: "/learn_more/secrets", to: "/secrets" },
          { from: "/learn_more/testing", to: "/testing" },
          { from: "/learn_more/nonlocal", to: "/nonlocal" },
          { from: "/tools/cli", to: "/rbt_cli" },
        ],
      },
    ],
  ],

  presets: [
    [
      "@docusaurus/preset-classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      {
        gtag: {
          trackingID: "G-T7HDGQM7JJ",
          anonymizeIP: true,
        },
        docs: {
          routeBasePath: "/",
          sidebarPath: require.resolve("./sidebars.js"),
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
        },
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    {
      algolia: {
        appId: "18K1ZGONTG",
        apiKey: "62d31a50ad9801c3c581c7061af8de14",
        indexName: "reboot",
      },
      navbar: {
        title: "",
        logo: {
          alt: "Reboot Logo",
          src: "img/reboot-logo.svg",
          srcDark: "img/reboot-logo-green.svg",
          href: "/",
        },
        items: [
          {
            href: "https://reboot.dev",
            label: "reboot.dev",
            position: "right",
          },
          {
            href: "https://github.com/reboot-dev/reboot",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Reboot",
                to: "/",
              },
            ],
          },
          {
            title: "Community",
            items: [
              {
                label: "Discord",
                href: "https://discord.gg/cRbdcS94Nr",
              },
              {
                label: "Twitter",
                href: "https://twitter.com/lets_reboot_dev",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "GitHub",
                href: "https://github.com/reboot-dev/reboot",
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Reboot, Inc.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ["protobuf", "bash"],
      },
    },
};

module.exports = config;
