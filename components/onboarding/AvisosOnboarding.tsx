'use client'
import { createContext, useCallback, useContext, useState } from 'react'
import Link from 'next/link'
import Toast from '@/components/Toast'
import { TITULOS, type PasoId } from '@/lib/onboarding/pasos'

/**
 * Avisa con un toast cuando completas un paso del onboarding **fuera del
 * dashboard**.
 *
 * Existe porque el progreso se DERIVA en el render del dashboard: si guardas
 * tus categorías en Configuración, ninguna otra página sabe que acabas de
 * completar un paso, y el gesto quedaba sin ninguna respuesta.
 *
 * Quien avisa es el formulario que acaba de guardar, no el servidor: es el
 * único que sabe si su dato pasó de vacío a lleno, y así no cuesta ni una
 * consulta extra. El checklist del dashboard sigue siendo la única fuente de
 * verdad del progreso; esto es solo el acuse de recibo.
 *
 * Fuera del proveedor —o con el onboarding terminado u oculto— `useAvisoPaso`
 * devuelve una función que no hace nada, así que los formularios pueden
 * llamarla siempre sin preguntar.
 */
const Ctx = createContext<(paso: PasoId) => void>(() => {})

export function useAvisoPaso() {
  return useContext(Ctx)
}

export default function AvisosOnboarding({
  activo,
  children,
}: {
  /** El onboarding está en curso. Con él terminado u oculto, no se avisa nada. */
  activo: boolean
  children: React.ReactNode
}) {
  const [paso, setPaso] = useState<PasoId | null>(null)

  // `useCallback` con `activo` como única dependencia: sin esto, cada render
  // del proveedor entregaría una función nueva a todos los formularios.
  const avisar = useCallback(
    (id: PasoId) => {
      if (activo) setPaso(id)
    },
    [activo],
  )

  return (
    <Ctx.Provider value={avisar}>
      {children}
      {paso && (
        <Toast onCerrar={() => setPaso(null)}>
          <span className="font-medium text-tinta">Listo: {TITULOS[paso]}</span>
          <br />
          <Link href="/dashboard" className="text-azul hover:underline">
            Ver tu progreso
          </Link>
        </Toast>
      )}
    </Ctx.Provider>
  )
}
