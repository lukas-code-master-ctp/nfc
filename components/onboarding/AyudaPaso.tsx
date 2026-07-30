'use client'
import { ayudaDe } from '@/lib/onboarding/ayuda'
import type { PasoId } from '@/lib/onboarding/pasos'
import { MockFormulario, MockModal, MockSubida, MockChip, MockPantallas } from './mocks/Mocks'

/**
 * Lo que se despliega al abrir el chevron de un paso: el mockup animado y el
 * "cómo hacerlo" en pasos cortos.
 *
 * `TarjetaProgreso` lo carga con `import()` dinámico, así que ni este archivo ni
 * los mockups entran al bundle del dashboard hasta que alguien abre un paso —y
 * nunca, para quien ya terminó el onboarding.
 */
export default function AyudaPaso({ pasoId }: { pasoId: PasoId }) {
  const a = ayudaDe(pasoId)

  return (
    <div className="mt-2 rounded-xl bg-lienzo p-3">
      {a.mock === 'formulario' && (
        <MockFormulario campo={a.campo ?? ''} boton={a.boton ?? ''} ejemplo={a.ejemplo ?? ''} />
      )}
      {a.mock === 'modal' && <MockModal />}
      {a.mock === 'subida' && <MockSubida />}
      {a.mock === 'chip' && <MockChip />}
      {a.mock === 'pantallas' && <MockPantallas />}

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-acero">
        {a.comoHacerlo.map((linea) => (
          <li key={linea}>{linea}</li>
        ))}
      </ol>
    </div>
  )
}
