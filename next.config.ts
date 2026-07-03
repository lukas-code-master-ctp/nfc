import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin (vía jwks-rsa) hace require() de `jose`, que es ESM-only.
  // Si Next lo bundlea con webpack, resuelve jose a su build webapi/ESM y el
  // runtime de Node falla con ERR_REQUIRE_ESM. Externalizándolos, Node los
  // resuelve nativamente eligiendo su build CommonJS.
  serverExternalPackages: ["firebase-admin", "jwks-rsa", "jose"],

  // Proxeamos el handler de OAuth de Firebase (/__/auth/*) y sus recursos
  // (/__/firebase/*) bajo NUESTRO propio dominio. Así el popup de Google
  // (signInWithPopup / reauthenticateWithPopup) corre en el MISMO origen que la
  // app y el sessionStorage se comparte entre la ventana y el popup. Sin esto,
  // en navegadores con storage particionado (Safari, Firefox estricto, Brave,
  // incógnito, webviews in-app) se pierde el estado y Firebase lanza
  // `auth/missing-initial-state`. Requiere setear
  // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=app.tapcar.cl en Vercel (build-time → redeploy).
  async rewrites() {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) return [];
    const firebaseAuthHost = `${projectId}.firebaseapp.com`;
    return [
      { source: "/__/auth/:path*", destination: `https://${firebaseAuthHost}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `https://${firebaseAuthHost}/__/firebase/:path*` },
    ];
  },
};

export default nextConfig;
