/**
 * Los cinco mockups animados que ilustran los pasos del onboarding.
 *
 * Viven juntos en un archivo porque comparten la misma caja, la misma paleta y
 * las mismas convenciones de dibujo; separarlos multiplicaría el andamiaje sin
 * separar responsabilidades.
 *
 * Reglas de estos dibujos:
 * - Todo el movimiento va con la variante `motion-safe:`, así que con
 *   `prefers-reduced-motion` el mockup queda fijo. Los keyframes de
 *   `app/globals.css` terminan en el estado base justamente para eso: la
 *   ilustración estática tiene que leerse igual de bien que la animada.
 * - Son esquemas, no capturas: si la UI real cambia de color o de posición, un
 *   esquema sigue siendo cierto y una captura queda mintiendo.
 * - `aria-hidden`: lo que el mockup muestra ya está escrito en la lista de
 *   "cómo hacerlo" que va al lado. Para un lector de pantalla es decoración.
 */

const CAJA = 'w-full rounded-xl border border-linea bg-lienzo'

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 320 132" className={CAJA} role="presentation" aria-hidden="true">
      {children}
    </svg>
  )
}

/** Texto chico dentro del dibujo. Los mockups no usan la tipografía real. */
function Etiqueta({ x, y, children, tenue = false }: { x: number; y: number; children: string; tenue?: boolean }) {
  return (
    <text x={x} y={y} className={`text-[9px] ${tenue ? 'fill-acero' : 'fill-tinta'}`} style={{ fontSize: 9 }}>
      {children}
    </text>
  )
}

/** Llena un campo y toca un botón. Sirve a los cinco pasos de Configuración. */
export function MockFormulario({ campo, boton }: { campo: string; boton: string }) {
  return (
    <Marco>
      <rect x="20" y="16" width="280" height="100" rx="8" className="fill-superficie stroke-linea" strokeWidth="1" />
      <Etiqueta x={34} y={40} tenue>{campo}</Etiqueta>
      <rect x="34" y="48" width="180" height="18" rx="4" className="fill-lienzo stroke-linea" strokeWidth="1" />
      {/* El "texto" que se escribe: crece desde la izquierda. */}
      <rect
        x="40"
        y="55"
        width="120"
        height="4"
        rx="2"
        className="origin-left fill-tinta motion-safe:animate-mock-escribir"
        style={{ transformBox: 'fill-box' }}
      />
      <rect x="34" y="80" width="86" height="22" rx="6" className="fill-azul motion-safe:animate-mock-pulso" />
      <text x="77" y="94" textAnchor="middle" className="fill-white" style={{ fontSize: 9 }}>{boton}</text>
    </Marco>
  )
}

/** Un panel que aparece sobre el dashboard: el modal de alta de vehículo. */
export function MockModal() {
  return (
    <Marco>
      {/* La página de fondo, atenuada como cuando hay un modal encima. */}
      <rect x="14" y="12" width="292" height="108" rx="8" className="fill-superficie stroke-linea" strokeWidth="1" />
      <rect x="26" y="24" width="70" height="6" rx="3" className="fill-linea" />
      <rect x="230" y="22" width="64" height="18" rx="6" className="fill-azul" />
      <text x="262" y="35" textAnchor="middle" className="fill-white" style={{ fontSize: 8 }}>+ Nuevo</text>
      <rect x="26" y="48" width="268" height="20" rx="6" className="fill-lienzo" />
      {/* El modal. */}
      <g className="origin-center motion-safe:animate-mock-entrar" style={{ transformBox: 'view-box' }}>
        <rect x="66" y="40" width="188" height="76" rx="8" className="fill-superficie stroke-azul" strokeWidth="1.5" />
        <Etiqueta x={80} y={58}>Nuevo vehículo</Etiqueta>
        <rect x="80" y="66" width="70" height="14" rx="4" className="fill-lienzo stroke-linea" strokeWidth="1" />
        <text x="86" y="76" className="fill-acero" style={{ fontSize: 7 }}>ABCD·12</text>
        <rect x="156" y="66" width="84" height="14" rx="4" className="fill-lienzo stroke-linea" strokeWidth="1" />
        <rect x="80" y="90" width="60" height="16" rx="5" className="fill-azul" />
        <text x="110" y="101" textAnchor="middle" className="fill-white" style={{ fontSize: 8 }}>Guardar</text>
      </g>
    </Marco>
  )
}

/** Varias fotos que se acumulan y se guardan como un solo PDF. */
export function MockSubida() {
  return (
    <Marco>
      <rect x="20" y="16" width="280" height="100" rx="8" className="fill-superficie stroke-linea" strokeWidth="1" />
      <Etiqueta x={34} y={36} tenue>Páginas del documento</Etiqueta>
      {/* Tres fotos que entran una tras otra: la cámara del celular devuelve
          una sola por vez, así que la app las va acumulando. */}
      {[0, 1, 2].map((i) => (
        <g
          key={i}
          className="motion-safe:animate-mock-foto"
          style={{ animationDelay: `${i * 0.45}s` }}
        >
          <rect
            x={34 + i * 46}
            y="46"
            width="38"
            height="48"
            rx="4"
            className="fill-lienzo stroke-linea"
            strokeWidth="1"
          />
          <path
            d={`M${40 + i * 46} 82 l8 -12 l7 9 l5 -6 l6 9 z`}
            className="fill-acero/40"
          />
          <circle cx={62 + i * 46} cy="56" r="3" className="fill-acero/40" />
        </g>
      ))}
      <path d="M182 70 h16" className="stroke-acero" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M194 66 l5 4 l-5 4" className="fill-none stroke-acero" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="210" y="46" width="38" height="48" rx="4" className="fill-superficie stroke-azul" strokeWidth="1.5" />
      <text x="229" y="74" textAnchor="middle" className="fill-azul" style={{ fontSize: 9 }}>PDF</text>
      <Etiqueta x={258} y={74} tenue>1 archivo</Etiqueta>
    </Marco>
  )
}

/** El chip del llavero y el celular que se le acerca. */
export function MockChip() {
  return (
    <Marco>
      {/* Llavero: anilla + la ficha con el chip. */}
      <circle cx="52" cy="46" r="9" className="fill-none stroke-acero" strokeWidth="2" />
      <path d="M52 55 v8" className="stroke-acero" strokeWidth="2" />
      <rect x="30" y="62" width="44" height="34" rx="6" className="fill-superficie stroke-tinta" strokeWidth="1.5" />
      <text x="52" y="83" textAnchor="middle" className="fill-azul" style={{ fontSize: 8 }}>TapCar</text>
      {/* Ondas NFC: salen cuando el celular ya está cerca. */}
      <g className="origin-center motion-safe:animate-mock-onda" style={{ transformBox: 'fill-box' }}>
        <path d="M84 62 a16 16 0 0 1 0 34" className="fill-none stroke-azul" strokeWidth="2" strokeLinecap="round" />
        <path d="M92 56 a24 24 0 0 1 0 46" className="fill-none stroke-azul/60" strokeWidth="2" strokeLinecap="round" />
      </g>
      {/* Celular que se acerca. */}
      <g className="motion-safe:animate-mock-acercar">
        <rect x="132" y="26" width="72" height="88" rx="9" className="fill-superficie stroke-tinta" strokeWidth="1.5" />
        <rect x="156" y="32" width="24" height="3" rx="1.5" className="fill-linea" />
        <rect x="140" y="44" width="56" height="8" rx="3" className="fill-linea" />
        <rect x="140" y="58" width="56" height="26" rx="4" className="fill-lienzo" />
        <text x="168" y="74" textAnchor="middle" className="fill-acero" style={{ fontSize: 7 }}>Documentos</text>
        <rect x="140" y="90" width="56" height="8" rx="3" className="fill-vigente/30" />
      </g>
      <Etiqueta x={218} y={72} tenue>Se abre la ficha</Etiqueta>
    </Marco>
  )
}

/** Dashboard y Reportes: el estado de hoy contra el historial. */
export function MockPantallas() {
  return (
    <Marco>
      {/* Dashboard: el estado de ahora. */}
      <g className="motion-safe:animate-mock-turno">
        <rect x="18" y="16" width="136" height="100" rx="8" className="fill-superficie stroke-linea" strokeWidth="1" />
        <Etiqueta x={30} y={34}>Dashboard</Etiqueta>
        <Etiqueta x={30} y={46} tenue>¿Cómo está hoy?</Etiqueta>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x="30" y={56 + i * 18} width="88" height="12" rx="4" className="fill-lienzo" />
            <circle
              cx="128"
              cy={62 + i * 18}
              r="4"
              className={i === 0 ? 'fill-vencido' : i === 1 ? 'fill-por-vencer' : 'fill-vigente'}
            />
          </g>
        ))}
      </g>
      {/* Reportes: lo que ya pasó. */}
      <g className="motion-safe:animate-mock-turno" style={{ animationDelay: '2s' }}>
        <rect x="166" y="16" width="136" height="100" rx="8" className="fill-superficie stroke-linea" strokeWidth="1" />
        <Etiqueta x={178} y={34}>Reportes</Etiqueta>
        <Etiqueta x={178} y={46} tenue>¿Qué pasó?</Etiqueta>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x="178" y={56 + i * 18} width="42" height="12" rx="4" className="fill-lienzo" />
            <rect x="226" y={56 + i * 18} width="30" height="12" rx="4" className="fill-lienzo" />
            <rect x="262" y={56 + i * 18} width="28" height="12" rx="4" className="fill-lienzo" />
          </g>
        ))}
      </g>
    </Marco>
  )
}
