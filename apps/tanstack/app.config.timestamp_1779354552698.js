// app.config.ts
import { defineConfig } from "vinxi";
var app_config_default = defineConfig({
  server: {
    preset: "node-server"
  },
  routers: [
    {
      name: "public",
      type: "static",
      dir: "./public"
    },
    {
      name: "client",
      type: "spa",
      handler: "./app/client.tsx"
    }
  ]
});
export {
  app_config_default as default
};
