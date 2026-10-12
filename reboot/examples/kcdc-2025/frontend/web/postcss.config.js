import { fileURLToPath } from "url";

export default {
  plugins: {
    // Tailwind looks for its config in the working directory, which
    // is `frontend/` (where `npm run build` and `vite` run), not
    // here; name it.
    tailwindcss: {
      config: fileURLToPath(new URL("./tailwind.config.js", import.meta.url)),
    },
    autoprefixer: {},
  },
};
