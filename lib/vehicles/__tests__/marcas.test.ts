import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { MARCAS, sugerirMarcas, normalizarMarca } from '@/lib/vehicles/marcas'

/**
 * Las guardas de abajo leen el archivo fuente del script y lo recorren con
 * regex que cuentan saltos de línea (`\n}\n\n`). En Windows, con el
 * `core.autocrlf=true` que es el default, el checkout entrega CRLF y esas
 * secuencias pasan a ser `\r\n}\r\n\r\n`: el regex deja de calzar y la guarda
 * falla por el sistema operativo, no por el código.
 *
 * Eso es peor que una molestia: la guarda existe para que
 * `scripts/normalizar-marcas.mjs` no se desvíe de `lib/vehicles/marcas.ts`, y
 * un fallo que depende del computador invita a "arreglarlo" aflojando el
 * regex — con lo que dejaría de morder en silencio, que es exactamente lo que
 * vino a evitar. Normalizar acá deja el regex estricto y el resultado igual en
 * cualquier checkout.
 */
function leerFuente(ruta: string): string {
  return readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n')
}

describe('la lista', () => {
  it('está ordenada alfabéticamente, ignorando acentos y mayúsculas', () => {
    const clave = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const ordenada = [...MARCAS].sort((a, b) => clave(a).localeCompare(clave(b), 'es'))
    expect([...MARCAS]).toEqual(ordenada)
  })

  it('no tiene repetidas ni espacios sobrantes', () => {
    expect(new Set(MARCAS).size).toBe(MARCAS.length)
    for (const m of MARCAS) expect(m).toBe(m.trim())
  })
})

describe('sugerirMarcas', () => {
  // El caso que motivó el feature. "Mitsubishi" también contiene "sub", pero
  // quien escribe "sub" busca Subaru: por eso el que EMPIEZA va primero, aunque
  // Mitsubishi aparezca antes en la lista alfabética.
  it('encuentra por el principio, y eso manda sobre el orden alfabético', () => {
    expect(sugerirMarcas('sub')).toEqual(['Subaru', 'Mitsubishi'])
  })

  it('también encuentra en medio de la palabra', () => {
    expect(sugerirMarcas('aru')).toEqual(['Subaru'])
  })

  // Lo que empieza con el texto va primero AUNQUE alfabéticamente vaya después:
  // Dodge y Peugeot contienen "ge", pero quien escribe "ge" busca Geely.
  it('prioriza las que empiezan con el texto sobre las que solo lo contienen', () => {
    expect(sugerirMarcas('ge')).toEqual(['Geely', 'Dodge', 'Peugeot', 'Volkswagen'])
  })

  it('ignora acentos en los dos sentidos', () => {
    expect(sugerirMarcas('citroen')).toEqual(['Citroën'])
    expect(sugerirMarcas('skoda')).toEqual(['Škoda'])
  })

  it('ignora mayúsculas y espacios alrededor', () => {
    expect(sugerirMarcas('  SUB  ')).toEqual(['Subaru', 'Mitsubishi'])
  })

  it('con la query vacía no sugiere nada: abrir el modal no debe llenarse de marcas', () => {
    expect(sugerirMarcas('')).toEqual([])
    expect(sugerirMarcas('   ')).toEqual([])
  })

  it('sin coincidencias devuelve vacío', () => {
    expect(sugerirMarcas('zzzz')).toEqual([])
  })

  // Con "a" hay 39 candidatos (marcas que contienen la letra "a"): el tope
  // real es 8. `toBeLessThanOrEqual(8)` pasaría igual con un límite de 3 o con
  // el filtro roto — `toBe(8)` es la aserción que de verdad lo fija.
  it('corta en 8 por defecto: una lista más larga tapa el formulario en un celular', () => {
    expect(sugerirMarcas('a')).toHaveLength(8)
  })

  it('respeta un tope explícito', () => {
    expect(sugerirMarcas('a', 3)).toHaveLength(3)
  })

  // "MERCEDES BENZ" (con espacio, como lo escribe casi todo Chile) tiene que
  // seguir sugiriendo Mercedes-Benz (con guion), y no perderla a mitad de
  // camino al seguir tipeando.
  it('ignora la puntuación: "mercedes b" sigue sugiriendo Mercedes-Benz', () => {
    expect(sugerirMarcas('mercedes')).toContain('Mercedes-Benz')
    expect(sugerirMarcas('mercedes b')).toContain('Mercedes-Benz')
    expect(sugerirMarcas('mercedes benz')).toContain('Mercedes-Benz')
  })
})

describe('normalizarMarca', () => {
  it('lleva a la forma canónica lo que calza con la librería', () => {
    expect(normalizarMarca('  subaru ')).toBe('Subaru')
    expect(normalizarMarca('MERCEDES-BENZ')).toBe('Mercedes-Benz')
  })

  it('recupera los acentos que el usuario no escribió', () => {
    expect(normalizarMarca('citroen')).toBe('Citroën')
  })

  it('colapsa espacios internos', () => {
    expect(normalizarMarca('great   wall')).toBe('Great Wall')
  })

  // Una lista abierta no puede imponerle una escritura a lo que no conoce.
  it('a una marca desconocida solo le saca los espacios, sin tocar su escritura', () => {
    expect(normalizarMarca('  JMC ')).toBe('JMC')
    expect(normalizarMarca('jmc')).toBe('jmc')
  })

  it('una cadena vacía sigue vacía', () => {
    expect(normalizarMarca('')).toBe('')
    expect(normalizarMarca('   ')).toBe('')
  })

  // La escritura más común de Mercedes-Benz en Chile lleva espacio, no guion.
  // La clave de comparación deja solo caracteres alfanuméricos (además de lo
  // que ya hace `normalizarBusqueda`), así que la puntuación deja de importar
  // para reconocer una marca conocida — sin que eso cambie `normalizarBusqueda`,
  // que sigue intacta para el buscador del dashboard.
  it('ignora la puntuación al reconocer una marca conocida', () => {
    expect(normalizarMarca('MERCEDES BENZ')).toBe('Mercedes-Benz')
    expect(normalizarMarca('mercedes benz')).toBe('Mercedes-Benz')
    expect(normalizarMarca('ssang yong')).toBe('SsangYong')
  })

  // Una marca desconocida conserva su escritura tal cual (la lista sigue
  // abierta): quitar la puntuación de la CLAVE de comparación no significa
  // quitársela al VALOR que se guarda.
  it('una marca desconocida con puntuación conserva su escritura, no se le quita', () => {
    expect(normalizarMarca('J.M.C.')).toBe('J.M.C.')
  })
})

/**
 * Los scripts son `.mjs` y no pueden importar el TypeScript de `lib/`, así que
 * `scripts/normalizar-marcas.mjs` DUPLICA esta lista. El proyecto ya pisó esta
 * trampa: el comparador de orden de `backfill-resumen.mjs` se desvió del de la
 * app. Si las listas se separan, el script normaliza a valores que la app no
 * reconoce y nadie se entera.
 */
describe('el script no puede desviarse de la librería', () => {
  it('su lista de marcas es idéntica, en el mismo orden', () => {
    const fuente = leerFuente('scripts/normalizar-marcas.mjs')
    const bloque = fuente.match(/const MARCAS = \[([\s\S]*?)\n\]/)
    expect(bloque, 'no se encontró `const MARCAS = [...]` en el script').toBeTruthy()
    const delScript = [...bloque![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(delScript).toEqual([...MARCAS])
  })

  /**
   * La guarda anterior fija la LISTA, pero `normalizarMarca` del script tiene
   * su propia lógica (una copia, no un import — los scripts son .mjs y no
   * pueden importar TypeScript). Con la clave alfanumérica del Important 3,
   * esa lógica dejó de ser un one-liner: si alguien la ajusta en un lado y no
   * en el otro, el script normaliza distinto que la app sin que ningún test
   * lo note. Por eso esta guarda compara COMPORTAMIENTO, no texto fuente: se
   * extrae el cuerpo real de la función del script y se ejecuta (con
   * `new Function`, sandboxeada, sin tocar el archivo), y se compara su
   * resultado con `normalizarMarca` de la librería sobre un set de entradas
   * que incluye las 69 marcas y variantes sucias.
   */
  it('normaliza exactamente igual que la librería (comparando comportamiento, no texto)', () => {
    const fuente = leerFuente('scripts/normalizar-marcas.mjs')
    const bloque = fuente.match(/const normalizarBusqueda[\s\S]*?\n}\n\nconst projectId/)
    expect(bloque, 'no se encontró el bloque de normalización en el script').toBeTruthy()
    const codigo = bloque![0].replace(/\n\nconst projectId$/, '')
    // Extrae y ejecuta la función real del script (sandboxeada) para comparar
    // comportamiento, no texto fuente.
    const fabrica = new Function('MARCAS', `${codigo}\nreturn normalizarMarca`) as (
      marcas: readonly string[],
    ) => (raw: string) => string
    const normalizarMarcaDelScript = fabrica(MARCAS)

    const entradas = [
      ...MARCAS,
      ...MARCAS.map((m) => m.toLowerCase()),
      ...MARCAS.map((m) => `   ${m}   `),
      ...MARCAS.map((m) => m.replace(/-/g, ' ')), // guion → espacio (Mercedes-Benz → Mercedes Benz)
      'MERCEDES BENZ',
      'mercedes benz',
      'ssang yong',
      'citroen',
      'skoda',
      '  JMC ',
      'jmc',
      'Marca Rara SpA',
      '',
      '   ',
    ]
    for (const raw of entradas) {
      expect(normalizarMarcaDelScript(raw), `entrada: "${raw}"`).toBe(normalizarMarca(raw))
    }
  })
})
