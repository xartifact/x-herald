// app.config.ts
import { defineConfig } from "@tanstack/start/config";
import tsr from "@tanstack/react-router-plugin/vite";
var app_config_default = defineConfig({
  server: {
    preset: "node-server"
  },
  vite: {
    plugins: [
      tsr()
    ]
  }
});
export {
  app_config_default as default
};
