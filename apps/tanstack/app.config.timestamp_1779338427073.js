// app.config.ts
import { defineConfig } from "@tanstack/start/config";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
var app_config_default = defineConfig({
  server: {
    preset: "node-server"
  },
  vite: {
    plugins: [
      tailwindcss(),
      viteTsConfigPaths({
        projects: ["./tsconfig.json"]
      })
    ]
  }
});
export {
  app_config_default as default
};
