import { defineConfig } from 'vinxi'

export default defineConfig({
  server: {
    preset: 'node-server',
  },
  routers: [
    {
      name: 'public',
      type: 'static',
      dir: './public',
    },
    {
      name: 'client',
      type: 'spa',
      handler: './app/client.tsx',
    },
  ],
})
