import { normalizarBusqueda } from '@/lib/vehicles/buscar'

/**
 * Marcas de vehículos para el autocompletado del alta.
 *
 * Pensada para **flota chilena**, no para autos particulares: por eso incluye
 * camiones (Hino, Isuzu, Iveco, Scania, Freightliner) y la ola china completa,
 * que ya es mayoría en flotas nuevas.
 *
 * Vive en código y no en Firestore: cambia una vez al año, y en Firestore
 * costaría una lectura cada vez que alguien abre el modal, para siempre.
 *
 * Ordenada alfabéticamente ignorando acentos (Škoda va entre Shineray y Smart).
 * Si agregas una marca, agrégala también en `scripts/normalizar-marcas.mjs`:
 * hay un test que falla si las dos listas se separan.
 */
export const MARCAS: readonly string[] = [
  'Alfa Romeo', 'Audi', 'BAIC', 'Bajaj', 'BMW', 'BYD', 'Cadillac', 'Changan',
  'Chery', 'Chevrolet', 'Chrysler', 'Citroën', 'DFSK', 'Dodge', 'Dongfeng',
  'DS', 'Fiat', 'Ford', 'Foton', 'Freightliner', 'Geely', 'GMC', 'Great Wall',
  'Haval', 'Hino', 'Honda', 'Hyundai', 'International', 'Isuzu', 'Iveco',
  'JAC', 'Jaecoo', 'Jaguar', 'Jeep', 'Jetour', 'Kawasaki', 'Kia', 'Land Rover',
  'Lexus', 'Mack', 'Mahindra', 'MAN', 'Maxus', 'Mazda', 'Mercedes-Benz', 'MG',
  'MINI', 'Mitsubishi', 'Nissan', 'Omoda', 'Opel', 'Peugeot', 'Porsche', 'RAM',
  'Renault', 'Scania', 'SEAT', 'Shineray', 'Škoda', 'Smart', 'SsangYong',
  'Subaru', 'Suzuki', 'Tata', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
  'Yamaha',
]

/** Ocho: en un celular una lista más larga tapa el formulario completo. */
const LIMITE_SUGERENCIAS = 8

/**
 * Marcas que calzan con lo que el usuario lleva escrito.
 *
 * Primero las que **empiezan** con el texto y después las que lo contienen en
 * cualquier parte, cada grupo en el orden de `MARCAS`. Quien escribe "ge" busca
 * Geely, no Dodge, aunque Dodge vaya antes alfabéticamente.
 *
 * Con la query vacía devuelve `[]`: abrir el modal y recibir ocho marcas
 * alfabéticas no ayuda a nadie.
 */
export function sugerirMarcas(query: string, limite: number = LIMITE_SUGERENCIAS): string[] {
  const q = normalizarBusqueda(query)
  if (!q) return []
  const empiezan: string[] = []
  const contienen: string[] = []
  for (const marca of MARCAS) {
    const n = normalizarBusqueda(marca)
    if (n.startsWith(q)) empiezan.push(marca)
    else if (n.includes(q)) contienen.push(marca)
  }
  return [...empiezan, ...contienen].slice(0, limite)
}

/**
 * La marca tal como debe guardarse: forma canónica si calza con la librería, y
 * si no, el texto con los espacios saneados **conservando la escritura del
 * usuario**. La lista es abierta, así que no puede imponerle un formato a una
 * marca que no conoce.
 */
export function normalizarMarca(raw: string): string {
  const limpio = raw.replace(/\s+/g, ' ').trim()
  if (!limpio) return ''
  const n = normalizarBusqueda(limpio)
  return MARCAS.find((m) => normalizarBusqueda(m) === n) ?? limpio
}
