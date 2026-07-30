// Genera `app/apple-icon.png` desde `app/icon.svg`.
//
// Por qué hace falta un PNG aparte del favicon SVG: **iOS no usa el `icon` de la
// app ni el manifest** para el acceso directo en la pantalla de inicio. Exige un
// `<link rel="apple-touch-icon">` y solo acepta **raster**. Sin este archivo, al
// "Agregar a Inicio" el iPhone muestra una captura de la página o una letra
// genérica. Android sí lee el SVG, y por eso allá funcionaba igual.
//
// Next emite el `<link rel="apple-touch-icon">` solo si existe
// `app/apple-icon.(png|jpg|jpeg)` — el SVG NO sirve para esta convención.
//
// Dos detalles que importan para que se vea bien en iOS:
//  - **Sin esquinas redondeadas propias**: iOS aplica su propia máscara. Si el
//    PNG ya viene redondeado, las esquinas del archivo quedan fuera del recorte y
//    aparece un doble borde. Por eso se fuerza `rx="0"` a full bleed.
//  - **Sin transparencia**: iOS compone el icono sobre un fondo que no controlas,
//    así que se aplana contra el azul de marca.
//
// Uso: node scripts/generar-apple-icon.mjs
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const AZUL_MARCA = '#2952e6' // --color-azul de app/globals.css
const LADO = 180 // el tamaño que pide Apple para iPhone

const svg = await readFile('app/icon.svg', 'utf8')
// El favicon lleva rx="18" para verse redondeado en la pestaña; acá va cuadrado
// porque el recorte lo hace iOS.
const fullBleed = svg.replace(/rx="18"/, 'rx="0"')
if (fullBleed === svg) {
  console.warn('Aviso: no se encontró rx="18" en app/icon.svg. Revisa que el icono siga siendo full bleed.')
}

const png = await sharp(Buffer.from(fullBleed))
  .resize(LADO, LADO)
  .flatten({ background: AZUL_MARCA }) // aplana el alfa: iOS no lo maneja bien
  .png()
  .toBuffer()

await writeFile('app/apple-icon.png', png)

const { width, height, channels, hasAlpha } = await sharp(png).metadata()
console.log(`app/apple-icon.png escrito: ${width}x${height}, ${channels} canales, alfa=${hasAlpha}, ${png.length} bytes`)
