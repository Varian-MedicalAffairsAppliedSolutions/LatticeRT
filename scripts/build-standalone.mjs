#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const indexPath = resolve(root, "index.html");
const outPath = resolve(root, "standalone.html");

const html = readFileSync(indexPath, "utf8");
const pattern = /<script\s+src="([^"]+)"><\/script>/g;

const inlined = html.replace(pattern, (_match, src) => {
  const srcPath = resolve(root, src);
  let content = readFileSync(srcPath, "utf8");
  // Avoid ending the inline block early if a vendor file contains </script>.
  content = content.replaceAll("</script>", "<\\/script>");
  return `<script>\n${content}\n</script>`;
});

writeFileSync(outPath, inlined, "utf8");
console.log(`Wrote ${outPath}`);
