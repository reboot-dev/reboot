import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["./backend/**/*.ts", "./api/**/*.ts", "./constants.ts"],
  bundle: false,
  platform: "node",
  logLevel: "info",
  format: "esm",
  outdir: "dist",
  sourcemap: "inline",
});
