import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
//
// The frontend calls the HeatShield backend with RELATIVE URLs (/api/risk).
// During `npm run dev` / `npm run preview`, Vite forwards /api/* to the
// main FastAPI backend (backend/, which calls Person 2's calculate_risk()),
// so the browser never makes a cross-origin request.
//
//   VITE_RISK_API_TARGET  where the main backend listens
//                         (default http://127.0.0.1:8000)
//   VITE_API_BASE_URL     optional absolute API base for production builds
//                         served without this proxy (leave empty in dev)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const proxy = {
    '/api': {
      target: env.VITE_RISK_API_TARGET || 'http://127.0.0.1:8000',
      changeOrigin: true,
    },
  }

  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
  }
})
