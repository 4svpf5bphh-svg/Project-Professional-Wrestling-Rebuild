import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const repository = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root,
  base: "./",
  publicDir: false,
  server: {
    host: "127.0.0.1",
    port: 4181,
    strictPort: true,
    fs: { allow: [repository] },
  },
  preview: { host: "127.0.0.1", port: 4181, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL("../../dist/premium-ppw", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});
