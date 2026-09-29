# Friction log

Real problems we hit while building Puente (MCP server) and alexa-plus-sim (Alexa+ simulator), written down
the day they happened. Format per entry: task, steps, expected vs. actual, severity, workaround, suggestion.

Severity scale: **Critical** (blocked, no workaround) · **High** (wrong output that could hurt users) ·
**Medium** (hours lost, workaround exists) · **Low** (minutes lost, annoyance).

---

## 1. Elicitation from a tool handler throws on protocol 2026-07-28

- **Tool:** MCP TypeScript SDK v2 (`@modelcontextprotocol/server` 2.1.0)
- **Task:** Before saving school dates to the family calendar, ask the parent which dates to keep.
- **Steps:** Called `ctx.mcpReq.elicitInput({ mode: 'form', message, requestedSchema })` inside the tool handler,
  the pattern shown in most examples written for earlier protocol versions.
- **Expected:** The client shows the form and the handler receives the answer.
- **Actual:** The method is marked deprecated in the typings and throws on 2026-07-28 requests. The new pattern is to
  return `inputRequired({ inputRequests: { key: inputRequired.elicit(...) } })` and read the answer on the retried
  call with `inputResponse()` / `acceptedContent()`; state across rounds goes in `requestState`.
- **Severity:** Medium
- **Workaround:** Read the JSDoc inside `node_modules/@modelcontextprotocol/server/dist/*.d.mts` and rewrote the tool
  as a multi-round-trip handler. For state that must survive the round trip (the exact email draft the parent
  approves), used the built-in `createRequestStateCodec` (HMAC-signed `requestState`).
- **Suggestion:** Add an "`elicitInput` → `inputRequired`" migration section with one complete server + client
  example to the SDK README, and make the thrown error name the replacement API.

## 2. Client default ("legacy") negotiation silently disables forms with a stateless server

- **Tool:** MCP TypeScript SDK v2 (`@modelcontextprotocol/client` 2.1.0 / 2.2.0)
- **Task:** Smoke-test the calendar confirmation from a Node client.
- **Steps:** `new Client(info, { capabilities: { elicitation: { form: {} } } })`, registered an
  `elicitation/create` handler, called the tool.
- **Expected:** The handler is called with the form, then the tool finishes.
- **Actual:** Tool error: *"Cannot request input 'dates' (elicitation/create): the client on this 2025-era connection
  did not declare the required capability (no client capabilities are available on this connection — per-request
  legacy serving cannot receive server-to-client requests)"*. The client declared the capability; the real cause is
  that `versionNegotiation` defaults to `'legacy'`.
- **Severity:** Medium
- **Workaround:** `versionNegotiation: { mode: 'auto' }` on the client.
- **Suggestion:** Warn at `connect()` when a client registers an elicitation handler but negotiates the legacy era,
  and name the fixing option in the server-side error.

## 3. Claude on Bedrock: first call works, then "use case details have not been submitted"

- **Tool:** Amazon Bedrock (Converse API, cross-region inference profiles)
- **Task:** Try Claude Haiku 4.5 as a stronger instruction follower for Spanish explanations.
- **Steps:** Converse with `global.anthropic.claude-haiku-4-5-20251001-v1:0` (answered), then with the `us.` profile,
  then `global.` again.
- **Expected:** Either consistent access or a consistent, clear requirement.
- **Actual:** The first global call succeeded; every later call returned `ResourceNotFoundException: Model use case
  details have not been submitted for this account. Fill out the Anthropic use case details form before using the
  model.` A 404-style exception for an access requirement is easy to misread as a wrong model ID.
- **Severity:** Low
- **Workaround:** Used Amazon Nova Pro (`us.amazon.nova-pro-v1:0`), which needed no extra step.
- **Suggestion:** Return `AccessDeniedException` with a direct link to the form, and apply the requirement
  consistently from the first call.

## 4. Finding a current, stronger Nova model by ID

- **Tool:** Amazon Bedrock model catalog
- **Task:** Move from Nova 2 Lite to a stronger Nova model.
- **Steps:** Tried `us.amazon.nova-premier-v1:0` and `global.amazon.nova-2-pro-v1:0`.
- **Expected:** A working model, or an error that points to the current one.
- **Actual:** "This model version has reached the end of its life" and "The provided model identifier is invalid",
  with no pointer to what replaced them.
- **Severity:** Low
- **Workaround:** Probed IDs with a tiny script; `us.amazon.nova-pro-v1:0` worked.
- **Suggestion:** End-of-life errors could name the recommended replacement ID.

## 5. Nova 2 Lite added wrong health facts and wrong weekdays to Spanish explanations

- **Tool:** Amazon Nova 2 Lite on Bedrock
- **Task:** Explain a school vaccination notice to a Spanish-speaking parent.
- **Steps:** Converse with a system prompt that forbids facts not in the notice; structured output via a forced tool.
- **Expected:** A faithful plain-Spanish explanation.
- **Actual:** The glossary said the Tdap booster protects against measles and rubella (it covers tetanus, diphtheria
  and pertussis); a second run invented a disease name. Dates came out with the wrong weekday ("jueves 9 de octubre"
  for Friday, October 9). Wrong health facts are the worst possible failure for this audience.
- **Severity:** High
- **Workaround:** (a) Switched to Nova Pro; (b) removed the model-written glossary and ship a hand-written glossary of
  school terms; (c) the model writes dates as `{YYYY-MM-DD}` tokens and the server renders the weekday; (d) deadlines
  that only appear as tasks are added to the calendar in code; (e) one automatic retry when the spoken line leaves
  out the first deadline. Measured 4/4 correct runs after the changes (was 3/4).
- **Suggestion:** Document date-grounding patterns for Nova, and offer a native "respond with this JSON schema" mode
  in Converse so structured output does not need a forced tool.

## 6. Structured output needs a forced tool, and zod transforms break the schema

- **Tool:** Bedrock Converse + zod 4 `toJSONSchema`
- **Task:** Get the explanation as JSON that matches our schema.
- **Steps:** Passed `z.toJSONSchema(schema)` as the only tool and set `toolChoice: { tool: { name } }`.
- **Expected:** JSON schema generation for any zod schema.
- **Actual:** A schema with `.transform()` cannot be expressed as output JSON Schema; generation needed
  `{ io: 'input' }`. There is no single documented recipe for this in the Bedrock guide.
- **Severity:** Low
- **Workaround:** `z.toJSONSchema(schema, { io: 'input' })`, drop the `$schema` key, validate the tool input with the
  same zod schema.
- **Suggestion:** A documented recipe for "structured output with Converse" in the Bedrock user guide.

## 7. MCP Apps: exact message names are only in the spec source

- **Tool:** MCP Apps extension (spec 2026-01-26)
- **Task:** Ship the bilingual notice card as an MCP App and host it in our simulator without the SDK.
- **Steps:** Read apps.extensions.modelcontextprotocol.io/api.
- **Expected:** The JSON-RPC method names and payloads for a minimal host and app.
- **Actual:** The page explains concepts; `ui/initialize`, `ui/notifications/tool-result`,
  `ui/notifications/size-changed`, `ui/resource-teardown` and the `hostContext` shape are only in
  `specification/2026-01-26/apps.mdx` on GitHub.
- **Severity:** Low
- **Workaround:** Implemented both sides from the spec file.
- **Suggestion:** A one-page "minimal host / minimal app without the SDK" reference.

---

## 8. Nova Pro goes silent when a tool result mixes text and JSON blocks

- **Tool:** Amazon Bedrock Converse, `us.amazon.nova-pro-v1:0`, tool use
- **Task:** Pass MCP tool results to the model: the tool's own sentence ("Guardé en el calendario: …"),
  a resource link, and the structured JSON, as three blocks of one `toolResult`.
- **Steps:** Recording the demo, the parent confirmed the calendar form with "Sí".
- **Expected:** A spoken confirmation, then normal tool calls in later turns.
- **Actual:** `stopReason: end_turn` with `content: []`. Storing that empty message made every
  later turn fail with a ValidationException (empty content). With the empty reply replaced, the
  model started writing tool calls as plain text (`{"child":"Sofía",…}Envié el mensaje…`), even
  inventing a `send_message` tool, instead of calling `draft_teacher_message`. Replaying the saved
  requests: same result every time with text + JSON; correct with JSON only or with text only.
- **Severity:** High (the assistant claimed a message was sent when nothing was called)
- **Workaround:** Send `structuredContent` alone as one JSON block when a tool has it, otherwise the
  text joined into one block; never store an empty assistant message; fall back to the tool's
  `spoken` field if the model still says nothing.
- **Suggestion:** Document that mixed text/JSON tool results are unsupported for Nova, or reject
  them with a clear ValidationException instead of an empty reply.

---

## Product feedback notes (for the Devpost form)

- **Used:** Amazon Bedrock (Converse API with tool use, Amazon Nova Pro; Nova 2 Lite tried), Bedrock API keys,
  AWS SDK for JavaScript v3 (`@aws-sdk/client-bedrock-runtime`), MCP TypeScript SDK v2 (server, client, node),
  MCP Apps extension.
- **Worked well:** Bedrock API keys: the JS SDK picks up `AWS_BEARER_TOKEN_BEDROCK` with no extra code; Nova Pro
  answers in about 2.5–3.5 s. MCP SDK v2: the client auto-fulfils `input_required` through the normal
  `elicitation/create` handler, and the built-in HMAC `requestState` codec saved us from writing crypto code.
- **Needs work:** entries 1–7 above.
- **Onboarding:** Bedrock "hello world" worked on the first call once the account finished verification (a few hours
  after sign-up it answered `AccessDenied`, then worked without changes).
