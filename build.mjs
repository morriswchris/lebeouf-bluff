/* Builds the site from src/ into dist/ — the only thing published to Pages.
 *
 *   - bundles src/app.jsx (+ react, react-dom) into dist/app.js
 *   - copies the static shell (html, css, sw, manifest, icons, favicons)
 *
 * Pass --watch to rebuild the bundle on save; --dev skips minification. */

import * as esbuild from "esbuild";
import { cp, rm, mkdir } from "node:fs/promises";

const OUTDIR = "dist";
const STATIC = [
  "index.html",
  "styles.css",
  "manifest.json",
  "sw.js",
  "favicon.ico",
  "favicon.png",
  "icons",
];

const watch = process.argv.includes("--watch");
const dev = watch || process.argv.includes("--dev");

async function copyStatic() {
  await Promise.all(
    STATIC.map((f) => cp(`src/${f}`, `${OUTDIR}/${f}`, { recursive: true }))
  );
}

await rm(OUTDIR, { recursive: true, force: true });
await mkdir(OUTDIR, { recursive: true });
await copyStatic();

const options = {
  entryPoints: ["src/app.jsx"],
  bundle: true,
  format: "iife",
  target: "es2018",
  outfile: `${OUTDIR}/app.js`,
  minify: !dev,
  define: {
    "process.env.NODE_ENV": dev ? '"development"' : '"production"',
  },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`watching src/ -> ${OUTDIR}/ (static assets copied once at start)`);
} else {
  await esbuild.build(options);
  console.log(`built ${OUTDIR}/`);
}
