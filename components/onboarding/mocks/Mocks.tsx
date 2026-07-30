/**
 * Mini-escenas animadas del onboarding: la UI real de TapCar en miniatura,
 * mostrando el gesto que el paso pide.
 *
 * No son esquemas abstractos: usan las mismas clases que los componentes
 * reales (cards `rounded-2xl border-linea bg-superficie shadow-sm`, botones
 * `bg-azul font-semibold`, las pills de estado con los hex de `StatusBadge`) y
 * heredan la tipografía Geist del body. Si la UI real cambia de estilo, estas
 * escenas se actualizan a mano — son cinco, y verse "como la app" es su razón
 * de ser.
 *
 * Reglas:
 * - Todo el movimiento va con `motion-safe:`; los keyframes de
 *   `app/globals.css` terminan en el estado base, así que con
 *   `prefers-reduced-motion` queda una viñeta fija que se lee igual.
 * - `aria-hidden` + `pointer-events-none`: lo que la escena muestra ya está
 *   escrito en el "cómo hacerlo" de al lado. Para un lector de pantalla es
 *   decoración; para el mouse, nada clickeable que prometa serlo.
 * - Ciclo común de 5s: el tap, la presión del botón y las apariciones están
 *   coreografiados entre sí por porcentaje del ciclo.
 */

function Escena({ children, alto = 'auto' }: { children: React.ReactNode; alto?: string }) {
  return (
    <div
      data-mock
      aria-hidden="true"
      className="pointer-events-none relative mx-auto w-full max-w-[300px] select-none"
      style={{ height: alto }}
    >
      {children}
    </div>
  )
}

/**
 * El punto de "tap" que viaja y presiona. Las coordenadas van por variables
 * porque cada escena tiene su propia geometría; el estado base es la posición
 * FINAL, así que la viñeta estática lo muestra apoyado en el botón: "toca aquí".
 */
function Toque({ x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number }) {
  return (
    <span
      className="absolute left-0 top-0 z-20 size-5 rounded-full bg-azul/20 ring-2 ring-azul motion-safe:animate-mock-toque"
      style={
        {
          '--mock-x0': `${x0}px`,
          '--mock-y0': `${y0}px`,
          '--mock-x1': `${x1}px`,
          '--mock-y1': `${y1}px`,
          transform: `translate(${x1}px, ${y1}px)`,
        } as React.CSSProperties
      }
    />
  )
}

/** El wordmark en miniatura: **Tap**Car, como en la barra real. */
function MiniMarca({ tamano = 'text-[10px]' }: { tamano?: string }) {
  return (
    <span className={`${tamano} font-semibold tracking-tight`}>
      <span className="text-azul">Tap</span>
      <span className="text-tinta">Car</span>
    </span>
  )
}

/** Llena el campo y guarda: los cinco pasos de Configuración. */
export function MockFormulario({ campo, boton, ejemplo }: { campo: string; boton: string; ejemplo: string }) {
  return (
    <Escena>
      <div className="rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
        <p className="text-[11px] font-medium text-acero">{campo}</p>
        <div className="mt-1.5 flex h-9 items-center rounded-lg border border-linea bg-superficie px-2.5">
          <span className="inline-block overflow-hidden whitespace-nowrap text-[11px] text-tinta motion-safe:animate-mock-tipeo">
            {ejemplo}
          </span>
          <span className="ml-0.5 h-3.5 w-px shrink-0 bg-tinta motion-safe:animate-mock-caret" />
        </div>
        <span className="mt-3 inline-block rounded-lg bg-azul px-3.5 py-2 text-[11px] font-semibold text-white motion-safe:animate-mock-presion">
          {boton}
        </span>
      </div>
      {/* Coordenadas MEDIDAS en el navegador (getBoundingClientRect), no
          estimadas. Ancladas a la izquierda porque el ancho de la escena varía
          con el panel (250-300px) y los botones viven a la izquierda. */}
      <Toque x0={90} y0={48} x1={38} y1={94} />
    </Escena>
  )
}

/** El modal de alta de vehículo apareciendo sobre el dashboard. */
export function MockModal() {
  return (
    <Escena alto="164px">
      {/* El dashboard de fondo, como se ve antes del clic. */}
      <div className="absolute inset-0 rounded-2xl border border-linea bg-superficie p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <MiniMarca />
          <span className="rounded-lg bg-azul px-2.5 py-1.5 text-[9px] font-semibold text-white">
            + Nuevo vehículo
          </span>
        </div>
        <div className="mt-3 h-9 rounded-xl border border-linea bg-lienzo" />
        <div className="mt-2 h-9 rounded-xl border border-linea bg-lienzo opacity-60" />
      </div>

      {/* El velo y el modal, como en NewVehicleModal. */}
      <div className="absolute inset-0 rounded-2xl bg-tinta/30 motion-safe:animate-mock-velo" />
      <div className="absolute inset-x-5 top-7 rounded-2xl border border-linea bg-superficie p-3 shadow-lg motion-safe:animate-mock-pop">
        <p className="text-[11px] font-semibold text-tinta">Nuevo vehículo</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <div className="flex h-7 items-center rounded-lg border border-linea px-2 text-[10px] text-tinta">JKLM·34</div>
          <div className="flex h-7 items-center rounded-lg border border-linea px-2 text-[10px] text-acero">Marca</div>
        </div>
        <div className="mt-2 flex gap-1.5">
          <span className="rounded-lg bg-azul px-3 py-1.5 text-[10px] font-semibold text-white motion-safe:animate-mock-presion">
            Guardar
          </span>
          <span className="rounded-lg border border-linea px-3 py-1.5 text-[10px] font-medium text-tinta">
            Cancelar
          </span>
        </div>
      </div>
      {/* x0 apunta a "+ Nuevo vehículo", que va anclado a la derecha: 205 deja
          el punto dentro del botón tanto a 250 como a 300px de ancho (medido). */}
      <Toque x0={205} y0={16} x1={57} y1={114} />
    </Escena>
  )
}

/** Varias fotos, sacadas una por una, que se guardan como un solo PDF. */
export function MockSubida() {
  return (
    <Escena>
      <div className="rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-medium text-acero">Páginas del documento</p>
          <p className="text-[9px] text-acero">3 de 10 páginas</p>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {[1, 2, 3].map((n, i) => (
            <div
              key={n}
              className="relative h-14 w-11 shrink-0 overflow-hidden rounded-lg border border-linea bg-[#dce7f5] motion-safe:animate-mock-item"
              style={{ animationDelay: `${i * 0.55}s` }}
            >
              {/* La foto: un documento sobre una mesa. */}
              <div className="absolute inset-x-1.5 top-1.5 bottom-3 rounded-[3px] bg-white shadow-sm">
                <div className="mx-1 mt-1 h-0.5 rounded bg-linea" />
                <div className="mx-1 mt-0.5 h-0.5 w-3/4 rounded bg-linea" />
                <div className="mx-1 mt-0.5 h-0.5 rounded bg-linea" />
              </div>
              <span className="absolute bottom-0.5 left-0.5 rounded bg-tinta/60 px-1 text-[7px] font-medium text-white">
                {n}
              </span>
            </div>
          ))}
          <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-acero" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <div
            className="flex h-14 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-azul bg-azul/5 motion-safe:animate-mock-item"
            style={{ animationDelay: '1.8s' }}
          >
            <svg viewBox="0 0 24 24" className="size-4 text-azul" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <span className="text-[8px] font-semibold text-azul">PDF</span>
          </div>
        </div>
        <span className="mt-3 inline-block rounded-lg border border-linea px-3 py-1.5 text-[10px] font-medium text-tinta">
          Agregar páginas
        </span>
      </div>
    </Escena>
  )
}

/** El chip del llavero y el celular que se le acerca hasta abrir la ficha. */
export function MockChip() {
  return (
    <Escena alto="150px">
      {/* overflow-hidden: el celular parte 34px a la derecha (mock-acercar) y
          sin el recorte asoma fuera del panel mientras se desliza (medido). */}
      <div className="absolute inset-0 flex items-center justify-center gap-4 overflow-hidden">
        {/* El llavero: anilla + la placa TapCar. */}
        <div className="flex flex-col items-center">
          <span className="size-6 rounded-full border-[3px] border-acero/60" />
          <span className="-mt-0.5 h-2.5 w-1 rounded-b bg-acero/60" />
          <div className="w-[68px] rounded-xl bg-azul px-2 py-3 text-center shadow-md">
            <span className="text-[10px] font-semibold tracking-tight text-white">TapCar</span>
            <div className="mx-auto mt-1 flex w-fit items-end gap-[3px]">
              <span className="h-1.5 w-0.5 rounded bg-white/80" />
              <span className="h-2.5 w-0.5 rounded bg-white/80" />
              <span className="h-3.5 w-0.5 rounded bg-white/80" />
            </div>
          </div>
        </div>

        {/* Las ondas NFC entre el chip y el celular. */}
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="rounded-full border-2 border-transparent border-r-azul motion-safe:animate-mock-ondas"
              style={{ width: `${10 + i * 7}px`, height: `${16 + i * 10}px`, animationDelay: `${i * 0.25}s` }}
            />
          ))}
        </div>

        {/* El celular llegando, con la ficha pública ya abierta. */}
        <div className="motion-safe:animate-mock-acercar">
          <div className="h-[128px] w-[72px] rounded-[14px] border-2 border-tinta bg-superficie p-1 shadow-md">
            <div className="mx-auto mb-0.5 h-0.5 w-6 rounded bg-linea" />
            <div className="h-[110px] overflow-hidden rounded-[9px] bg-lienzo p-1.5">
              <div className="text-center"><MiniMarca tamano="text-[8px]" /></div>
              <p className="mt-0.5 text-center text-[9px] font-semibold text-tinta">JKLM·34</p>
              {/* La pantalla mide ~52px útiles: tamaños medidos para que la
                  pill "Vigente" no quede cortada por el overflow-hidden. */}
              {['SOAP', 'Permiso'].map((doc) => (
                <div key={doc} className="mt-1 flex items-center justify-between gap-0.5 rounded-md border border-linea bg-superficie px-1 py-0.5">
                  <span className="min-w-0 truncate text-[6px] text-tinta">{doc}</span>
                  <span className="shrink-0 rounded-full bg-[#E7F6EC] px-0.5 text-[5px] font-semibold leading-[9px] text-[#15803D]">Vigente</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Escena>
  )
}

/** Dashboard y Reportes lado a lado: el hoy contra el historial. */
export function MockPantallas() {
  return (
    <Escena>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-linea bg-superficie p-2.5 shadow-sm motion-safe:animate-mock-alternar">
          <p className="text-[10px] font-semibold text-tinta">Dashboard</p>
          <p className="text-[8px] text-acero">¿Cómo está hoy?</p>
          {(
            [
              ['bg-[#E7F6EC]', 'text-[#15803D]', 'Al día'],
              ['bg-[#FDF1DC]', 'text-[#B45309]', 'Por vencer'],
              ['bg-[#FCE7E7]', 'text-[#C81E1E]', 'Vencido'],
            ] as const
          ).map(([bg, color, label]) => (
            <div key={label} className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-linea p-1">
              <span className="size-4 shrink-0 rounded-md bg-azul/10" />
              <span className="h-1 min-w-0 flex-1 rounded bg-lienzo" />
              <span className={`shrink-0 rounded-full px-1 py-px text-[6px] font-semibold ${bg} ${color}`}>{label}</span>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-linea bg-superficie p-2.5 shadow-sm motion-safe:animate-mock-alternar" style={{ animationDelay: '3s' }}>
          <p className="text-[10px] font-semibold text-tinta">Reportes</p>
          <p className="text-[8px] text-acero">¿Qué pasó?</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {['Quién', 'Cuándo', 'Km'].map((h) => (
              <span key={h} className="text-[6px] font-medium text-acero">{h}</span>
            ))}
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="h-1.5 rounded bg-lienzo" />
            ))}
          </div>
        </div>
      </div>
    </Escena>
  )
}
