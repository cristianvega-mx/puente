// Hand-written explanations of US school words that confuse Spanish-speaking parents.
// Kept out of the model on purpose: these must be right every time.

type Entry = { term: string; match: RegExp; meaning: string };

const entries: Entry[] = [
  {
    term: 'permission slip',
    match: /permission slip/i,
    meaning: 'Hoja que usted firma para dar permiso de que su hijo vaya a una actividad fuera de la escuela.'
  },
  {
    term: 'chaperone',
    match: /chaperones?/i,
    meaning: 'Papá o mamá voluntario que acompaña y cuida a los niños durante una excursión.'
  },
  {
    term: 'field trip',
    match: /field trip/i,
    meaning: 'Excursión: salida del grupo con sus maestros a un museo, parque u otro lugar.'
  },
  {
    term: 'Picture Day',
    match: /picture day/i,
    meaning: 'Día en que un fotógrafo toma la foto escolar de cada alumno. Comprar las fotos es opcional.'
  },
  {
    term: 'retakes',
    match: /retakes?/i,
    meaning: 'Segunda oportunidad para tomar la foto escolar si el alumno faltó o no le gustó la primera.'
  },
  {
    term: 'Parent-Teacher Conference',
    match: /parent-teacher conferences?/i,
    meaning: 'Junta corta con el maestro para hablar de cómo va su hijo. Puede pedir un intérprete gratis.'
  },
  {
    term: 'Early Release Day',
    match: /early release/i,
    meaning: 'Día en que los alumnos salen más temprano de lo normal. Hay que planear quién los recoge.'
  },
  {
    term: 'free or reduced-price meals',
    match: /free or reduced-price meals/i,
    meaning: 'Programa que da comida escolar gratis o más barata según el ingreso de la familia.'
  },
  {
    term: 'immunization record',
    match: /immunization record/i,
    meaning: 'Cartilla de vacunación: el documento con las vacunas que ha recibido su hijo.'
  },
  {
    term: 'school nurse',
    match: /school nurse/i,
    meaning: 'Enfermera de la escuela: recibe los papeles de salud y atiende a los alumnos si se sienten mal.'
  }
];

export function glossaryFor(text: string): { term: string; meaning: string }[] {
  return entries.filter(entry => entry.match.test(text)).map(({ term, meaning }) => ({ term, meaning }));
}
