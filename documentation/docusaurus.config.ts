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
  tagline: "Distributed Data - Batteries Included - Learn How!",
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

  plugins: [tailwindPlugin],

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
