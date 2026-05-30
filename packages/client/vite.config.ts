import { defineConfig, PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import importMapPlugin from "vite-plugin-importmap";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const isProd = mode === "production" && false;

  // Плагин import map используем только в production
  const plugins: PluginOption[] = [react(), tsconfigPaths()];
  if (isProd) {
    plugins.unshift(
      importMapPlugin({
        imports: {
          react: "https://esm.sh/react@18.2.0",
          "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
          d3: "https://esm.sh/d3@7.8.5",
        },
      }),
    );
  }

  return {
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:8081", // Адрес вашего бэкенда
          changeOrigin: true,
        },
      },
    },
    plugins,
    build: {
      sourcemap: mode === "production" ? false : true,
    },
    resolve: {
      alias: {
        "@shared": "../shared/src",
      },
    },
  };
});
