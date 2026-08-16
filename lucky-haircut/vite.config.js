import { defineConfig } from 'vite'

// The haircut app is plain ES modules with no build step of its own; this
// config just points Vite at its folder so `npm run haircut` serves it.
export default defineConfig({
  root: 'lucky-haircut',
  server: { port: 5273 },
  build: { outDir: '../dist-lucky-haircut', emptyOutDir: true },
})
