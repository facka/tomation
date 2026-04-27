import { defineConfig } from "vite";
import dts from 'vite-plugin-dts'
import path from "path";

export default defineConfig({
  plugins: [
    dts({
      pathsToAliases: false,
      insertTypesEntry: true,
    }),
  ],
  resolve: {
    alias: [
      {
        find: "~",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
  server: {
    port: 3000,
  },
  build: {
    manifest: true,
    minify: true,
    reportCompressedSize: true,
    lib: {
      entry: path.resolve(__dirname, "src/main.ts"),
      fileName: "main",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [],
      output: {
        exports: 'named',
      },
    },
  },
});
