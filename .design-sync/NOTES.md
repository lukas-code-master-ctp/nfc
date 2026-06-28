# design-sync — notas del repo (TapCar UI)

Este repo es una **app Next.js**, no una librería de design system. La integración es **custom** (fuera del flujo normal del converter). Alcance acotado por decisión del usuario: 4 componentes presentacionales + tokens.

## Cómo está armado

- **Sin `dist/` ni build de librería.** Se usa un **barrel propio** como `--entry`: `.design-sync/ds-src/index.tsx`, que re-exporta como NOMBRES los componentes (`export default` → `export { default as X }`), porque el bundle IIFE no expone defaults.
- **Componentes sincronizados (4):** StatusBadge, PasswordInput, PublicVehicleView (los 3 reales en `components/`), y **VehicleCard vía shim** `.design-sync/ds-src/general/VehicleCard.tsx` (copia con `next/link` → `<a>`, para no arrastrar el runtime de Next al bundle).
- **Alias `@/`** resuelto por `cfg.tsconfig` (`tsconfig.json`, paths `@/* → ./*`).
- **CSS:** Tailwind v4 utilitario. No hay CSS estático en el repo (se compila en `next build`). Se compila a medida con `@tailwindcss/cli` desde `.design-sync/ds-src/tailwind.in.css` → `.design-sync/.cache/tailwind.out.css` (gitignored), apuntado por `cfg.cssEntry`. Ese input lleva los tokens `@theme`, los `@source` de los 4 componentes, y un **safelist** (`ds-src/safelist.txt`) que fuerza las utilidades de marca (`text-vigente`, `bg-ambar`, `bg-azul-press`, etc.) para que existan aunque ningún componente las use — así el conventions header es verídico y el agente puede usar toda la paleta.
- **Contratos `.d.ts`** escritos a mano en `cfg.dtsPropsFor` (el extractor no capta props de `export default` con tipo inline).
- **Overrides de tarjeta:** PublicVehicleView `single` 620x900 (ficha completa); VehicleCard `column` (tarjetas a ancho completo).
- **globalName:** `window.TapCarUI`. **Grupo:** todos en `general`.

## Comando para rebuild local

```sh
npx --yes @tailwindcss/cli@4 -i .design-sync/ds-src/tailwind.in.css -o .design-sync/.cache/tailwind.out.css
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./.design-sync/ds-src/index.tsx --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

Chromium ya está instalado (Playwright del repo, revision 1228) — el render check corre sin descargar nada.

## Known render warns

- Ninguna. Render check 4/4 limpio.

## Re-sync risks (qué vigilar)

- **El shim de VehicleCard puede quedar desactualizado.** Es una copia manual de `components/VehicleCard.tsx`. Si cambias el real (markup/props), refleja el cambio en `.design-sync/ds-src/general/VehicleCard.tsx`.
- **CSS compilado es generado y gitignored.** `.design-sync/.cache/tailwind.out.css` debe regenerarse antes de cada build (primer comando de arriba). Si falta, `[CSS_PLACEHOLDER]`/`[CSS_IMPORT_MISSING]`.
- **El safelist debe seguir el set de tokens.** Si agregas/renombras un token en `app/globals.css` (`@theme`), actualiza `ds-src/tailwind.in.css` (bloque `@theme`) y `ds-src/safelist.txt`, o el header mentirá.
- **Geist no se embarca.** Las previews usan stack del sistema (`--font-sans` apuntado a system-ui en `tailwind.in.css`). La tipografía real de la app (Geist) no viaja en el bundle de diseño — aceptado.
- **dtsPropsFor es manual.** Si cambian las props de un componente, actualiza el contrato en `.design-sync/config.json`.
- **Si se agregan componentes**, recuerda: deben exportarse en el barrel, agregarse a `componentSrcMap`, al `@source` del CSS, y (si tienen props inline) a `dtsPropsFor`.
