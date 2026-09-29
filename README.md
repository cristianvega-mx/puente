# Puente — school notices, explained in Spanish, through Alexa+

Millions of Spanish-speaking parents in the United States get their children's school notices in English: picture day,
field trip permission slips, parent-teacher conferences, vaccination deadlines. Missing one can mean a child stays
behind on a trip day or is sent home from school.

**Puente** ("bridge") is an MCP server that lets Alexa+ handle those notices in Spanish:

1. **Explains** each notice in plain Mexican Spanish: what happens, the dates, the costs and what the parent must do.
2. **Puts the dates on the family calendar** — after the parent picks which ones in a confirmation form.
3. **Writes the reply to the teacher in English** from what the parent says in Spanish, shows a Spanish
   back-translation, and saves it only when the parent approves. Puente never sends email by itself.

On an Echo Show, the notice appears as a bilingual card: the explanation in Spanish next to the original English text.

**Demo video (under 3 minutes):** https://youtu.be/kg4YrGWWAJk

This repository holds two projects:

| Folder | What it is |
|---|---|
| [`puente-server/`](puente-server) | The Puente MCP server (TypeScript, Streamable HTTP, protocol 2026-07-28). |
| [`alexa-plus-sim/`](alexa-plus-sim) | A standalone, open-source Alexa+ simulator: an Echo Show–style web host for any MCP server, with an Amazon Bedrock agent, voice in/out, on-screen elicitation forms and MCP Apps. |

## How it works

```
 parent's voice ──► alexa-plus-sim ──► Amazon Bedrock (Nova Pro) agent
                        │   ▲                 │ tool calls
                        │   │ input_required  ▼
                        │   └──────────── Puente MCP server ──► Amazon Bedrock (Nova Pro)
                        │                     │                  explains notices, drafts emails
                        ▼                     ▼
                 Echo Show screen      ui://puente/notice-card.html (MCP App)
```

### MCP features used

- **Tools:** `list_notices`, `get_notice`, `explain_notice`, `add_to_calendar`, `list_upcoming`, `draft_teacher_message`.
- **Resources:** `puente://family/profile`, `puente://family/calendar.ics` (iCalendar any phone can import),
  `puente://family/drafts`, and the MCP App `ui://puente/notice-card.html`.
- **Elicitation with multi-round-trip `input_required` results** (protocol 2026-07-28): the calendar tool asks which
  dates to save; the email tool asks for approval of the exact draft, carried between rounds in an HMAC-signed
  `requestState`.
- **MCP Apps** (extension spec 2026-01-26): `explain_notice` declares `_meta.ui.resourceUri`; hosts that support the
  `io.modelcontextprotocol/ui` extension render the bilingual card in a sandboxed iframe.
- **Structured output:** every tool has an `outputSchema` and returns `structuredContent`.
- **Transport:** Streamable HTTP, stateless.

### Getting details right

Parents act on what Puente says, so the model is kept away from the facts it gets wrong:

- The model writes dates as `{YYYY-MM-DD}` tokens; the server renders the weekday ("viernes 9 de octubre").
- School words ("permission slip", "early release"…) are explained by a hand-written glossary, not by the model.
- Deadlines that only appear as tasks are added to the calendar in code. Every date the model mentions must also be
  on its list of calendar dates, and the spoken line must include the earliest deadline; if not, the model is asked
  again with the problem named.
- Nothing is saved without the parent's confirmation, and nothing is ever sent.

See [FRICTION-LOG.md](FRICTION-LOG.md) for what went wrong while building it and how we worked around it.

## From the school inbox to Alexa

In this prototype the six notices are sample data. In real use, notices would reach Puente like this (not built yet):

1. **The family links Puente once** in the Alexa app and adds their children and schools.
2. **School email is forwarded to the family's Puente address**: one notice at a time with the mail app's Forward
   button, or automatically with a Gmail or Outlook filter that forwards only mail from the school or its messaging
   app (ParentSquare, ClassDojo, SchoolMessenger…). The rest of the inbox never leaves it.
3. **Puente accepts mail only from the school senders the family registered** and drops anything else unread.
4. **Paper notices** from the backpack arrive as a photo from the parent's phone.

Then the parent just asks: *"Alexa, ¿qué mandaron de la escuela?"* An Echo Show adds the bilingual card and tap-to-confirm
forms; on a speaker without a screen, Alexa reads the dates and asks before saving them (`add_to_calendar` already
falls back to a spoken confirmation when the device cannot show forms).

## Run it locally

Requirements: Node.js 22.9 or later and an Amazon Bedrock API key with access to Amazon Nova Pro.

```bash
# 1. The MCP server
cd puente-server
cp .env.example .env        # put your Bedrock API key in AWS_BEARER_TOKEN_BEDROCK
npm install
npm start                   # http://127.0.0.1:3000/mcp
npm run smoke               # in another terminal: exercises every tool, answering the forms

# 2. The Alexa+ simulator
cd ../alexa-plus-sim
cp .env.example .env        # same Bedrock key; MCP_SERVER_URL points at Puente
npm install
npm start                   # open http://127.0.0.1:4000 in Chrome
```

Try: *"¿Qué mandaron de la escuela de Sofía?"*, *"¿Qué dice el de la excursión?"*, *"Guárdalo en el calendario"*,
*"Dile a la maestra de Sofía que el lunes va a faltar porque tiene cita con el dentista"*.

The sample family (the Hernández family in Houston, their children Sofía and Mateo, their teachers and six notices)
is fictional. Set `PUENTE_TODAY=YYYY-MM-DD` to pin the demo date.

## License

MIT — see [LICENSE](LICENSE).
