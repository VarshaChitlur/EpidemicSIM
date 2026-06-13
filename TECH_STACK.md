# Epidemic Spread Simulator - Tech Stack Sheet

This document outlines the official technical stack, runtime specifications, compilers, and active API protocol endpoints powering the Epidemic Outpost application.

---

## 1. Core Platform & Runtime
- **Operating Environment**: Standalone sandboxed Docker containers running over Google Cloud Run.
- **Node.js**: `v22.x` (LTS Container Image Node LTS).
- **TypeScript**: `v5.8.x` strict-compiler verification mode ensuring absolute system type safety.

## 2. Server Architecture (Full-Stack Express Proxy)
- **Framework**: Express.js `v4.21.2` handling API communications and serving client binaries.
- **State Engine**: In-memory protocol session storing dynamic state logs and syndication parameters.
- **Bundler Pipeline**: `esbuild v0.25` packing the TypeScript backend cleanly into `dist/server.cjs` for high performance execution.
- **Dynamic Load Hook**: `tsx` daemon handling standard dev-server compilation locally.

## 3. Client User Interface
- **Framework**: React `v19.0.1` utilizing lightweight functional components, context registers, and custom state synchronization hooks.
- **Build Tooling**: Vite `v6.2.3` fast client bundler with hot refresh pipelines.
- **Styling Architecture**: Tailwind CSS `v4.0` implementing custom CSS custom properties `@theme`.
- **Icon Library**: `lucide-react` modern minimalist SVGs.
- **Motion Engine**: Framer Motion (`motion`) handling elegant entry transitions and tab state slides.

## 4. Intelligent Copilot & APIs
- **Core AI**: Google Gemini 3.5 Flash Model managed via the modern `@google/genai` TypeScript SDK.
- **API Security**: Encrypted server-side routing (e.g., `/api/chat`, `/api/simulate`) proxying secret credentials without browser exposure.
- **Web Grounding (Linkup API)**: Linkup Search Indexer API serving live global diagnostics overlays. The API works over high-performance vector indexes to extract snippets, title mappings, and URLs for grounding contexts.

## 5. Analytics & Visualizations
- **Data Graphs**: Recharts `v3.8.1` providing responsive SVG overlays, custom tooltips, bar charts, and coordinate projections.
- **SIR Mathematical Model**: Multi-variant Susceptible-Infected-Recovered projections mapped on dynamic array frames.
- **Map Renderer**: Vector-based SVG world coordinates mapping custom epidemic footprint densities.

---

## 6. Open Agent Protocol Integrations (AG UI / A2UI)
The application implements the **Agent-to-User-Interface (A2UI)** and **Antigravity (AG) UI** dynamic protocols (Compliance version `1.2.0`), enabling seamless programmatic interaction between autonomous AI agents and user interfaces.

* **Client Pull Mechanics**: The React UI runs an active polling loop (every 4 seconds) hitting `GET /api/a2ui/state` to synchronize coordinates and Tasks database.
* **Control Loops**: Structural updates received over standard ingress commands instantly trigger simulation recalculations in real time.

---

## 7. Official System API Specifications

Here is the exhaustive catalog of all HTTP endpoint proxies implemented in the system router:

### 1. Specification Discovery API (AG UI)
* **Endpoint**: `GET /api/a2ui/config`
* **Purpose**: Allows external agent frameworks to map existing controls, range constraints, enum parameters, and standard actions supported by the node.
* **Response Payload (JSON)**:
  ```json
  {
    "protocol": "Agent-to-User-Interface (A2UI) & Antigravity (AG) UI Open Standards",
    "spec_version": "1.2.0",
    "client_bridge": "Express/React 19 Active Polling Bridge",
    "documentation": { ... },
    "capabilities": {
      "simulationControl": {
        "parameters": {
          "vaccRate": { "type": "integer", "min": 0, "max": 100, "default": 45 },
          "socialDistance": { "type": "enum", "values": ["none", "mild", "moderate", "strict"], "default": "moderate" },
          "testingIntensity": { "type": "integer", "min": 0, "max": 100, "default": 50 },
          "selectedEpidemicId": { "type": "string", "values": ["covid19", "h5n1", "disease_x", "ebola", "mpox", "nipah"] }
        }
      }
    }
  }
  ```

### 2. State Sync API (A2UI)
* **Endpoint**: `GET /api/a2ui/state`
* **Purpose**: Returns the active system settings, state logs database, and tasks injected from programmatic streams.
* **Response Payload (JSON)**:
  ```json
  {
    "currentParams": {
      "vaccRate": 45,
      "socialDistance": "moderate",
      "testingIntensity": 50,
      "selectedEpidemicId": "covid19"
    },
    "actionsLog": [
      { "id": "act-12345", "timestamp": "...", "sender": "agent_antigravity", "type": "SET_PARAMS", "payload": { ... } }
    ],
    "externalTasks": []
  }
  ```

### 3. Action Ingress API (A2UI Command Sandbox)
* **Endpoint**: `POST /api/a2ui/action`
* **Purpose**: Dispatches state mutator commands from external autonomous modules or client debug tools.
* **Request Header**: `Content-Type: application/json`
* **Supported Actions**:
  - **`SET_PARAMS`**: Updates global simulation parameters.
    - *Payload*: `{ "vaccRate": 85, "socialDistance": "strict", "testingIntensity": 75, "selectedEpidemicId": "nipah" }`
  - **`ADD_TASK`**: Syndicates an actionable task to the stakeholder table.
    - *Payload*: `{ "title": "Deploy booster advisory", "group": "public_health", "region": "Americas", "priority": "High" }`
  - **`RESET`**: Restores the sandbox environment settings to factory-default coordinates.
    - *Payload*: `{}`
* **Response Payload**: `{ "success": true, "message": "...", "state": { ... } }`

### 4. Intel Search Proxy (Linkup Grounding)
* **API Engine**: Linkup High-Performance Search Indexer (`https://api.linkup.so/v1/search`)
* **Endpoint (Proxied)**: `POST /api/search`
* **Secure Environment Variable**: `LINKUP_API_KEY` (stored safely server-side to prevent client exposure)
* **Client Request Schema**:
  ```json
  {
    "query": "active COVID variants June 2026",
    "depth": "standard" // Supports "standard" or "deep" search capabilities
  }
  ```
* **Internal Server Outgoing API Action**:
  - **Method**: `POST`
  - **Target URI**: `https://api.linkup.so/v1/search`
  - **Headers**:
    - `"Content-Type": "application/json"`
    - `"Authorization": "Bearer <LINKUP_API_KEY>"`
  - **Payload**:
    ```json
    {
      "q": "<query>",
      "query": "<query>",
      "depth": "standard",
      "outputType": "searchResults"
    }
    ```
* **Unified Response Mapping Output (Standardized client array)**:
  ```json
  [
    {
      "name": "World Health Organization (WHO) Variant Report",
      "url": "https://www.who.int/emergencies/disease-outbreak-news/...",
      "snippet": "Active surveillance logs indicate high coverage of novel variants with localized caseload shifts..."
    }
  ]
  ```
* **Grounding Loop Flow**: When the Conversational AI Coordinator receives structured prompts with `webSearchEnabled: true`, the Node server automatically fires sequential search actions via Linkup, harvests real-time snippets, and pipes them directly as a text grounding context into the Google Gemini 3.5 context viewport to form precise structured coordinates.

### 5. Instant Mathematical Simulation Engine
* **Endpoint**: `POST /api/simulate`
* **Purpose**: Compute high-frequency daily Susceptible-Infected-Recovered sequences mathematically on the sever side.
* **Request Payload**:
  ```json
  {
    "vaccRate": 45,
    "socialDistance": "moderate",
    "testingIntensity": 50,
    "epidemic": { "id": "covid19", "name": "COVID-19", "r0": 3.2, "hospitalRate": 0.008, "recoveryRate": 0.08 }
  }
  ```
* **Response Payload**: Combined vectors arrays charting infection rates, peak case numbers, and maximum bed load dates.

### 6. Conversational AI Coordinator
* **Endpoint**: `POST /api/chat`
* **Purpose**: Handles real-time prompts, extracts vector changes automatically using Google Gemini 3.5, and searches live data as needed.
* **Request Payload**:
  ```json
  {
    "message": "We have an outbreak in Germany! Quarantine should be maximum and vaccinate 90%.",
    "history": [],
    "currentParams": { "vaccRate": 45, "socialDistance": "moderate", "testingIntensity": 50 },
    "webSearchEnabled": true,
    "epidemic": { "id": "covid19", "name": "COVID-19", "r0": 3.2 }
  }
  ```
* **Response Payload** (Dynamic structured output proxy):
  ```json
  {
    "answerText": "Extracted regional pandemic countermeasures updated accordingly...",
    "extractedParams": { "vaccRate": 90, "socialDistance": "strict", "testingIntensity": 50 },
    "simulationResult": { ... },
    "searchGrounding": { ... },
    "isFallbackMode": false,
    "tasks": [ ... ]
  }
  ```

### 7. Comma-Separated Values (CSV) Generation
* **Endpoint**: `POST /api/export/csv`
* **Purpose**: Aggregates mathematically plotted day sequences into download files.
* **Request Payload**: `{ "results": { "params": { ... }, "dailyCases": [ ... ], "dailyBeds": [ ... ] } }`
* **Response Header**: `Content-Type: text/csv` (and `Content-Disposition`)

### 8. System Status Watcher (Health check)
* **Endpoint**: `GET /api/health`
* **Purpose**: Confirms structural soundness and verifies runtime container environment uptime.
* **Response Payload**: `{ "status": "healthy", "time": "2026-06-13T09:18:15-07:00" }`
