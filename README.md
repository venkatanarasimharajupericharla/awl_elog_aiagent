# AWL ELog AI Agent — SAPUI5

A responsive **SAPUI5 / OpenUI5** app for AWL Agri Business Limited, Bundi. The app **boots
directly as a full-page AI Agent** (no dashboard): a conversation with a docked chat + voice
bar at the bottom. On load it greets the signed-in user and **proactively lists all their
logs**. Ask for a log (by name or document number, typed or spoken) and the agent renders it
as a **fillable UI5 form** with a working **Submit** action.

Which logs you see is driven by **plant → department → user** context.

> Branding: the AWL wordmark (`webapp/img/awl-logo.svg` black, `awl-logo-white.svg` white,
> `awl-mark-white.svg` compact) and deep-green theme are recreated in SVG/CSS. Drop in the
> official logo files to replace them. Brand colours live in the `:root` block of
> `webapp/css/style.css`.
>
> This is a self-contained front-end app. No backend, no build step, no API keys.

## Run it locally

```bash
python3 -m http.server 8080 --directory webapp     # or: npm start
# open http://localhost:8080/index.html
```
Serve over `http://` — `file://` won't load modules.

## Screens

The app is a multi-screen `sap.m.App` (NavContainer):

- **Agent (home)** — the chat. A **login-user dropdown** in the header switches between users
  across plants/departments (Bundi · Wheat Flour Packing / Packing Maintenance, and Kadi ·
  Edible Oil Packing) — the greeting and available logs update to that user's context.
- **Form screen** — naming a log in chat **navigates** here. Header fields are grouped into
  **sections**. Entries use a **vertical "New entry" form + Add row**; each added entry shows
  in an **"Added entries" list**. Tapping an entry opens the **Entry details** screen to
  review, **edit**, or **delete** it. **Submit** validates and records the log, posts a
  **confirmation message into the chat**, and returns to the agent. A **Home** button is
  always in the header.
- **Entry details screen** — review/edit a single entry's fields; **Delete** (header) removes
  it; **Back** returns to the form.
- **Admin app** — a **separate URL** (`#/admin`, reachable via the ⚙ button or by opening the
  URL directly; "Open Agent" returns to the chat). It opens a **list of all forms**; tapping
  one shows its **detail** where you can **change field configuration** — **name, type**
  (Text/Number/Date/Time/Dropdown/Text area), **required, options, validation (regex),
  section** — **Save** it, or **Delete form**. Changes update the definitions the renderer and
  agent use.

## Using it

The agent opens already showing your logs. Type in the bottom bar, tap the **🎙 mic** to
speak (browser Web Speech API; falls back to typing), or tap a log/chip. Then:

| Say / tap | The agent… |
| --- | --- |
| *(on load)* | greets you and lists every log for your department |
| `Show all logs` | lists every log, grouped by department |
| `Metal Detector Check Sheet` / `AB/P/02` | renders that fillable UI5 form |
| `Magnet cleaning` · `Daily stock` · `Net weight` · `Shift communication` | render the matching form |
| `Preventive maintenance conveyor` | renders the monthly PM checklist (day 1–31 grid) |
| `Switch department` | moves you to another department to see its logs |
| `Who am I` | shows your plant / department / user context |

Each form is built from **real UI5 controls** — a `SimpleForm` of `Input`/`DatePicker`
header fields and a `sap.m.Table` with editable cells (fixed descriptor rows stay read-only,
shift sections render as group headers). Press **Submit** to record the log: the agent posts
a confirmation with a field/row count, and the captured JSON payload is logged to the browser
console (swap in an OData/REST call to persist).

## The forms (with document numbers)

| Form name | Doc No. | Department |
| --- | --- | --- |
| Shift Communication Log Book | AB/P/03 | Wheat Flour Packing |
| Daily Stock Statement | AB/P/03 | Wheat Flour Packing |
| Metal Detector Check Sheet | AB/P/02 | Wheat Flour Packing |
| Magnet Cleaning Check List | AB/P/11 | Wheat Flour Packing |
| Net Weight Check Sheet | AB/P/07 | Wheat Flour Packing |
| Preventive Maintenance Checklist — Metal Detector | AB/P/08 | Packing Maintenance |
| Preventive Maintenance Checklist — Conveyor | AB/P/08 | Packing Maintenance |

## How it works

```
webapp/
├── index.html / Component.js / manifest.json   # OpenUI5 (Horizon theme) bootstrap
├── i18n/i18n.properties                         # texts
├── css/style.css                                # AWL branding + form styles
├── img/awl-logo*.svg, awl-mark-white.svg        # logo assets
├── view/App.view.xml                            # full-page AI Agent (App>Page: header, conversation, footer bar)
├── controller/App.controller.js                 # boots the agent, loads catalog, chat + voice, message rendering
├── model/
│   ├── catalog.json    ◀── plants, departments, users, and all form definitions (JSONB)
│   ├── JouleEngine.js  ◀── intent routing: context, list logs, match a form
│   └── FormRenderer.js ◀── turns a form definition into a submittable UI5 form (SimpleForm + Table)
```

Flow: the controller `fetch`es `catalog.json` and calls `JouleEngine.init(catalog)`. On each
message, `JouleEngine.respond(text)` either handles a command (list/switch/who-am-I) or
matches a form (by name, keyword, or document number) and returns it; `FormRenderer.render()`
builds the UI5 controls. Forms are filtered by the current `context` (plant + department).

## The JSONB form structure

Everything lives in [`webapp/model/catalog.json`](webapp/model/catalog.json). Top level:

```jsonc
{
  "plants":      [{ "id": "bundi", "name": "AWL Agri Business Limited, Bundi", "state": "Raj." }],
  "departments": [{ "id": "wfp", "plantId": "bundi", "name": "Wheat Flour Packing" }, …],
  "users":       [{ "id": "u1", "name": "Alex Rivera", "role": "Supervisor",
                    "plantId": "bundi", "departmentId": "wfp" }, …],
  "context":     { "plantId": "bundi", "departmentId": "wfp", "userId": "u1" },  // current session
  "forms":       [ …form definitions… ]
}
```

Each **form** is a self-describing definition the renderer understands:

```jsonc
{
  "id": "metal-detector-check-sheet",
  "name": "Metal Detector Check Sheet",
  "documentNo": "AB/P/02",
  "plantId": "bundi",
  "departmentId": "wfp",
  "keywords": ["metal detector", "probe", "ab/p/02"],   // used to match a prompt to this form
  "frequency": "Every 3 Hours",                          // optional boxed line
  "titleBox": "DAILY STOCK STATEMENT",                   // optional boxed subtitle
  "section":  "Wheat Flour Packing Section",             // optional, appended to company line
  "subtitle": "…",                                       // optional line under the form name
  "caption":  "…",                                       // optional small note above the grid

  // key-value fields rendered as "Label ______" with underline blanks:
  "headerFields": [
    { "label": "Location", "key": "location", "value": "Wheat Flour Packing", "grow": 1 }
  ],

  "grid": {
    // multi-row headers; each cell may span columns/rows:
    "headerRows": [
      [ { "t": "S No.", "rs": 2 }, { "t": "Production", "cs": 2 }, … ],
      [ { "t": "Pack" }, { "t": "Mt." }, … ]
    ],
    // leaf columns, in body order (optional width "w" and align):
    "columns": [ { "k": "sno", "w": "38px", "align": "center" }, { "k": "prodLine" }, … ],
    "rows": {
      "mode": "empty",            // blank rows to fill in…
      "count": 11,
      "serial": true              // …auto-number the first column
      // — OR —
      // "mode": "fixed",
      // "items": [
      //   { "section": "DAY SHIFT" },                       // shaded full-width separator
      //   { "cells": ["5/10 KG LINE-01", "Atta Packing"] }  // pre-filled leading cells; rest blank
      // ]
    }
  },

  // optional blocks under the grid — notes and small tables side by side:
  "aside": [
    { "type": "note", "label": "Shift Communication Note :-", "height": "150px", "width": "58%" },
    { "type": "minitable", "title": "PM Details in Kg.", "width": "40%",
      "cols": ["", "Wastage", "Consumption"],
      "rows": [["Primary PM", "", ""], ["Secondary PM", "", ""]] }
  ],

  "footerFields": [ { "label": "Cumulative Packing :-" } ],   // optional footer blank lines
  "signature":    "Sign. of Supervisor"                       // optional right-aligned sign-off
}
```

### Add or edit a form
Add a new object to `forms` in `catalog.json` — no code changes needed. Set its
`departmentId`, give it `keywords`, and describe the `grid`. The engine will match it from a
prompt and `FormRenderer` will render it. To add a plant/department/user, extend those arrays;
change `context` to set who is "logged in".

## Responsiveness
- The agent is full-screen on every device; the conversation is a centred column that
  narrows on phones, and the footer chat/voice bar stays docked.
- Header fields use `ResponsiveGridLayout` (2 columns on desktop, 1 on phone).
- Wide forms (e.g. the 31-day PM checklist) scroll horizontally inside their table.
# awl_elog_aiagent
