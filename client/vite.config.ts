import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import importMapPlugin from "vite-plugin-importmap";

export default defineConfig(({ mode }) => {
  const isProd = mode === "production" && false;

  // Плагин import map используем только в production
  const plugins = [react()];
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
    plugins,
    build: {
      rollupOptions: isProd
        ? {
            external: ["react", "react-dom/client", "d3"],
            output: {
              globals: {
                react: "React",
                "react-dom/client": "ReactDOM",
                d3: "d3",
              },
            },
          }
        : undefined,
    },
    optimizeDeps: isProd
      ? {
          exclude: ["react", "react-dom/client", "d3"],
        }
      : undefined,
  };
});
