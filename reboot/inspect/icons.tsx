// SVG icon components, defined as inline strings.
//
// We define SVG icons as TypeScript string constants rather than
// importing .svg files directly because the esbuild bundler in this
// project doesn't have a loader configured for SVG files. While esbuild
// supports SVG loaders (like "text" or "dataurl"), the Bazel rules for
// esbuild used here don't expose the loader configuration option. This
// approach keeps the SVG content separate from the main component file
// while maintaining compatibility with the build system.

import React from "react";
void React; // Prevents unused import error; ensures `React` is in scope for JSX.

export const searchIconSvg = `<svg
  width="16"
  height="16"
  viewBox="0 0 16 16"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"
    fill="currentColor"
  />
</svg>`;

export const SearchIcon = () => (
  <span dangerouslySetInnerHTML={{ __html: searchIconSvg }} />
);

export const copyIconSvg = `<svg
  width="16"
  height="16"
  viewBox="0 0 16 16"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M4 4.5A2.5 2.5 0 0 1 6.5 2H10a2.5 2.5 0 0 1 2.5 2.5v3.5a.5.5 0 0 1-1 0V4.5A1.5 1.5 0 0 0 10 3H6.5A1.5 1.5 0 0 0 5 4.5v3.5a.5.5 0 0 1-1 0v-3.5z"
    fill="currentColor"
  />
  <path
    d="M2.5 6A1.5 1.5 0 0 0 1 7.5v6A1.5 1.5 0 0 0 2.5 15h6A1.5 1.5 0 0 0 10 13.5v-6A1.5 1.5 0 0 0 8.5 6h-6zM2 7.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5v-6z"
    fill="currentColor"
  />
</svg>`;

export const CopyIcon = () => (
  <span dangerouslySetInnerHTML={{ __html: copyIconSvg }} />
);

export const checkmarkIconSvg = `<svg
  width="16"
  height="16"
  viewBox="0 0 16 16"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="m13.498 1.043l-.021.018-6.98 8.027-2.476-2.476a.75.75 0 0 0-1.06 1.061l3 3a.75.75 0 0 0 1.076-.02l7.5-8.5a.75.75 0 1 0-1.04-.915z"
    fill="currentColor"
  />
</svg>`;

export const CheckmarkIcon = () => (
  <span dangerouslySetInnerHTML={{ __html: checkmarkIconSvg }} />
);
