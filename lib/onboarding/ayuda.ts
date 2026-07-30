import type { PasoId } from '@/lib/onboarding/pasos'

/**
 * Cuál de los mockups animados ilustra el paso.
 *
 * Son cinco y se reparten entre los nueve pasos: `formulario` sirve para los
 * cinco pasos que son "llena un campo y guarda", y los otros cuatro cubren los
 * casos donde el gesto no es un formulario.
 */
export type MockId = 'formulario' | 'modal' | 'subida' | 'chip' | 'pantallas'

export interface Ayuda {
  mock: MockId
  /** Etiqueta del campo que dibuja el mockup. Solo la usa `formulario`. */
  campo?: string
  /** Etiqueta del botón que dibuja el mockup. Solo la usa `formulario`. */
  boton?: string
  /** Lo que se ve escribiéndose en el campo. Solo la usa `formulario`. */
  ejemplo?: string
  /** Cómo hacerlo, en pasos cortos y concretos. */
  comoHacerlo: string[]
}

/**
 * El contenido de ayuda de cada paso, aparte de la lógica de `pasos.ts`.
 *
 * Vive en un módulo propio y no dentro de `Paso` por dos razones: los textos
 * cambian mucho más seguido que la lógica de progreso, y así el bundle de los
 * mockups se carga con `import()` dinámico solo cuando alguien abre un paso,
 * sin arrastrar nada al render del dashboard.
 */
export const AYUDA: Record<PasoId, Ayuda> = {
  vehiculo: {
    mock: 'modal',
    comoHacerlo: [
      'Toca «Nuevo vehículo» en el dashboard.',
      'Escribe la patente, la marca y el modelo.',
      'Guarda: el resto de los datos los puedes completar después.',
    ],
  },
  documentos: {
    mock: 'subida',
    comoHacerlo: [
      'Abre la ficha del vehículo, pestaña Documentos.',
      'Elige el tipo de documento y su fecha de vencimiento.',
      'Toca «Agregar páginas»: puedes sacar varias fotos, una por una, y se guardan como un solo PDF.',
    ],
  },
  chip: {
    mock: 'chip',
    comoHacerlo: [
      'El chip TapCar viene en el llavero del auto.',
      'En la ficha del vehículo, pestaña Ajustes, toca «Grabar chip».',
      'Acerca el chip al celular hasta que confirme. Desde Android se graba en la app; en iPhone se graba con NFC Tools.',
    ],
  },
  empresa: {
    mock: 'formulario',
    campo: 'Razón social',
    ejemplo: 'Transportes Andes SpA',
    boton: 'Guardar',
    comoHacerlo: [
      'Entra a Configuración.',
      'Llena razón social, RUT y giro.',
      'Guarda. Usamos estos datos para la facturación.',
    ],
  },
  categorias: {
    mock: 'formulario',
    campo: 'Nombre de la categoría',
    ejemplo: 'Camionetas',
    boton: 'Agregar',
    comoHacerlo: [
      'En Configuración, busca «Categorías de vehículos».',
      'Escribe un nombre —camionetas, arriendo, reparto— y toca «Agregar».',
      'Guarda los cambios. Después asignas la categoría en la ficha de cada vehículo.',
    ],
  },
  mantencion: {
    mock: 'formulario',
    campo: 'Cada cuántos km',
    ejemplo: '10.000',
    boton: 'Guardar',
    comoHacerlo: [
      'En Configuración, busca «Pauta de mantención».',
      'Escribe cada cuántos kilómetros o cada cuántos meses toca mantención.',
      'Guarda. Un vehículo puede tener su propia pauta si necesita otra.',
    ],
  },
  equipo: {
    mock: 'formulario',
    campo: 'Correo',
    ejemplo: 'ana@transportesandes.cl',
    boton: 'Invitar',
    comoHacerlo: [
      'En Configuración, busca «Equipo».',
      'Escribe el correo y elige el rol: Administrador, Editor o Visor.',
      'Invita. Le llega un correo para entrar. Hasta 5 miembros.',
    ],
  },
  conductores: {
    mock: 'formulario',
    campo: 'Nombre del conductor',
    ejemplo: 'Ana Soto',
    boton: 'Agregar',
    comoHacerlo: [
      'En Configuración, busca «Conductores».',
      'Agrega nombre y PIN de 4 dígitos. Si tienes varios, pégalos desde Excel.',
      'El conductor no necesita cuenta: entra con su PIN al tomar el vehículo.',
    ],
  },
  reportes: {
    mock: 'pantallas',
    comoHacerlo: [
      'El Dashboard responde «¿cómo está la flota ahora?»: qué vence, qué está en uso, qué tiene daño.',
      'Reportes responde «¿qué pasó?»: quién usó cada vehículo, cuándo y con qué resultado.',
      'Los dos leen los mismos datos; lo que cambia es la pregunta.',
    ],
  },
}

export function ayudaDe(id: PasoId): Ayuda {
  return AYUDA[id]
}
