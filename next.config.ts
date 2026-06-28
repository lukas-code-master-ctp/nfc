import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin (vía jwks-rsa) hace require() de `jose`, que es ESM-only.
  // Si Next lo bundlea con webpack, resuelve jose a su build webapi/ESM y el
  // runtime de Node falla con ERR_REQUIRE_ESM. Externalizándolos, Node los
  // resuelve nativamente eligiendo su build CommonJS.
  serverExternalPackages: ["firebase-admin", "jwks-rsa", "jose"],
};

export default nextConfig;
