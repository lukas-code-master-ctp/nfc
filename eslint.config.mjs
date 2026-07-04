import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Next 16 activa esta regla como error. Marca incluso el patrón idiomático
      // de carga de datos en useEffect (fetch + setLoading/setItems), incluso cuando
      // el setState ocurre tras un await. La dejamos en "warn" para conservar la señal
      // sin romper el check de Lint del deploy por un patrón intencional.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
