## A web app's frontend lives under `frontend/`

A standalone web app used to be a stock Vite project in a top-level
`web/`, with its generated client at `web/src/api/`. Every app's
frontend now lives under `frontend/`: the SPA's own files under
`frontend/web/`, the generated client at `frontend/api/`, and the
Vite project files at the top of `frontend/`. An app that already has
a `frontend/` directory needs nothing from this section.

If the project has a top-level `web/index.html` and no `frontend/`:

1. Make `frontend/` and move the Vite project files there:
   `web/package.json`, `web/package-lock.json`, `web/vite.config.ts`,
   `web/tsconfig.json`, `web/tsconfig.app.json`, `web/tsconfig.node.json`,
   and `web/node_modules/` (or `rm -rf` it and `npm install` in
   `frontend/` at the end). Then move what is left of `web/` to
   `frontend/web/`: `index.html`, `src/`, `public/`, and every
   `.env*` file, which Vite keeps reading from there once the config
   is rooted at `web/`.

2. Move the generated client out of the SPA: delete
   `frontend/web/src/api/` and, in `.rbtrc`, replace
   `generate --react=web/src/api` with `generate --react=frontend/api`
   (and a `generate --web=web/src/api` line, if present, with
   `generate --web=frontend/api`).

3. In `frontend/vite.config.ts`, root the config at `web/` and point
   the build and the client alias beside it:

   ```ts
   root: "web",
   build: { outDir: "../dist/web", emptyOutDir: true },
   resolve: {
     alias: { "@api": path.resolve(__dirname, "api") },
     dedupe: ["react", "react-dom", "zod"],
   },
   ```

   with `import path from "path";` at the top. In
   `frontend/tsconfig.app.json`, change `"include": ["src"]` to
   `"include": ["web/src"]` and add, under `compilerOptions`,
   `"baseUrl": "."` and `"paths": { "@api/*": ["./api/*"] }`.

4. Rewrite the client imports. Any import of a `_rbt_react` or
   `_rbt_web` module by a relative path, such as
   `from "./api/<pkg>/v1/<name>_rbt_react"` or
   `from "../api/<pkg>/v1/<name>_rbt_react"`, becomes
   `from "@api/<pkg>/v1/<name>_rbt_react"`.

5. Rename the paths everywhere else they appear:

   - `.gitignore`: `web/src/api/` -> `frontend/api/`, `web/dist/` ->
     `frontend/dist/`.
   - `tests/web_test.py` (or wherever the `frontend` fixture is
     defined): `vite(directory='web')` -> `vite(directory='frontend')`.
   - `.dockerignore`, a `Dockerfile`, and CI scripts: `web/` ->
     `frontend/`, and a `cd web` -> `cd frontend`.
   - A deploy that publishes `web/dist/` now publishes
     `frontend/dist/web/`.

6. `cd frontend && npm install && npm run build` to confirm the
   build, then `rm -rf web` once it is empty.
