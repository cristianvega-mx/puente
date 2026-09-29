# Puente — plan para el hackathon de Amazon (track Alexa+)

Cierre oficial: **23 oct 2026, 12:00 PDT (13:00 hora de CDMX)**. Meta interna: enviar el **20 oct**.
Página del concurso: https://amazonappdev2026.devpost.com/

## La idea

Una familia latina en EE. UU. recibe avisos de la escuela en inglés (día de fotos, excursiones,
juntas, formularios). Con Puente, la mamá o el papá le pregunta a Alexa+ en español
"¿qué mandaron de la escuela de Sofía?" y Alexa+:

1. le explica cada aviso en español: qué pasa, cuándo, cuánto cuesta y qué hay que hacer;
2. agenda las fechas en el calendario familiar, pidiendo confirmación antes;
3. redacta en inglés el mensaje para la maestra ("Sofía faltará el lunes por cita médica")
   y le muestra la traducción al español antes de guardarlo.

En la pantalla del Echo Show se ve el aviso lado a lado en inglés y en español.

## Qué piden los jueces

Implementación técnica, diseño (producto completo y coherente), impacto potencial (necesidad real
y específica) y calidad de la idea. Friction log = hasta +10%.

Requisitos duros: servidor MCP con spec 2025-11-25 o posterior y transporte Streamable HTTP;
el repo debe usarlo de verdad; video de menos de 3 minutos en inglés en YouTube o Vimeo.

## Arquitectura

- **puente-server/** — servidor MCP (Node + TypeScript, SDK v2 `@modelcontextprotocol/server`,
  que implementa la spec 2026-07-28). Herramientas:
  - `list_notices`, `get_notice` — avisos de la escuela de cada hijo.
  - `explain_notice` — resumen en español con fechas, montos y acciones (LLM vía Amazon Bedrock;
    sampling ya está en desuso en la spec 2026-07-28, así que el servidor llama al modelo directo).
  - `add_to_calendar` — pide confirmación con *elicitation* antes de guardar; expone un `.ics`.
  - `draft_teacher_message` — redacta en inglés y muestra la retrotraducción; confirma con elicitation.
  - `list_upcoming` — próximos eventos escolares.
  - Recursos: perfil de la familia, calendario. Interfaz MCP App (`ui://`) para la tarjeta bilingüe.
- **alexa-plus-sim/** — simulador de Alexa+ **open source** (proyecto adicional para el mini-reto
  Open Source): pantalla tipo Echo Show, voz del navegador, agente con Amazon Bedrock (mini-reto
  AWS Builder), cliente MCP que atiende elicitation y muestra interfaces MCP App.
- **FRICTION-LOG.md** — cada tropiezo con las herramientas, con el formato que pide el concurso.

## Calendario

| Fechas | Qué |
|---|---|
| 27 sep – 3 oct | Servidor Puente: datos de ejemplo, herramientas, recursos, pruebas |
| 1 – 8 oct | Simulador: agente con Bedrock, cliente MCP, elicitation, interfaz MCP App |
| 8 – 12 oct | Tarjeta bilingüe, voz en español e inglés, pulido |
| 12 – 16 oct | Desplegar en el VPS de Hostinger, README, licencias, friction log |
| 16 – 19 oct | Video de demostración (pantalla + subtítulos + voz generada) y texto para Devpost |
| 20 oct | Enviar |

## Lo que necesita Cristian

Cuentas de GitHub, Devpost (inscribirse y aceptar reglas), YouTube (subir el video) y AWS
(para Bedrock; él mismo guarda sus llaves en el archivo `.env`).
