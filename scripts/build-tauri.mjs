#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const distDir = resolve(root, "dist");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

cpSync(resolve(root, "index.html"), resolve(distDir, "index.html"));
cpSync(resolve(root, "src"), resolve(distDir, "src"), { recursive: true });
cpSync(resolve(root, "vendor"), resolve(distDir, "vendor"), { recursive: true });

console.log(`Wrote ${distDir}`);
