import { defineConfig } from 'vite';
import { resolve } from 'path';

// Tunnel hostnames are allowed so the site can be shared over a temporary
// public URL (Cloudflare quick tunnels) without Vite's host check blocking it.
const tunnelHosts = ['.trycloudflare.com', '.loca.lt', '.ngrok-free.app', '.ngrok.io'];

export default defineConfig({
  // Relative asset URLs so the build works from a domain root *or* from a
  // subpath like username.github.io/novera-website.
  base: './',
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: tunnelHosts
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: tunnelHosts
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        book: resolve(__dirname, 'book.html')
      }
    }
  }
});
