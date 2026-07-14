import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Railway (and similar platforms) serve the app from a host Vite can't know
  // about ahead of time (a generated subdomain, or later a custom domain) -
  // vite preview's host-check middleware rejects unknown Host headers by
  // default, so allow all here rather than hardcoding one hostname.
  preview: {
    allowedHosts: true,
  },
})
