# The Third Half

**AI exit waves for the Allianz Arena** · pitch demo for the FC Bayern Fan AI-DEATION
*Mia san mia. Nur ned alle auf oamal.*

At the final whistle 75,024 fans leave at once, and most of them head down the Esplanade to one U6 station, Fröttmaning. The Third Half works like a load balancer for that crowd. It gives every block an exit wave (a time slot) and a route, so that the station approach and the platform queue stay below capacity. Fans who wait earn rewards: FC Bayern store points, partner-café points or ticket-lottery entries. Google Gemini explains every decision and writes each fan's personal message.

> Simulation with assumed parameters for demonstration purposes. Venue geometry is from OpenStreetMap. Capacities, behaviour and acceptance rates are illustrative assumptions, not official figures.

---

## Quick start

Requirements: Node.js ≥ 20.12 (the repo pins 24 in `.nvmrc`; run `nvm use`).

```bash
npm install
npm run dev          # http://localhost:5173
```

That's all. The app works fully offline, using the bundled responses in `src/data/gemini-cache.json`. The header pill shows **Gemini: Cached**.

### Add your Gemini API key (free tier works)

1. Create a key at <https://aistudio.google.com/apikey>.
2. Copy the env template and fill it in:
   ```bash
   cp .env.example .env
   # .env
   GEMINI_API_KEY=your-key-here
   GEMINI_MODEL=gemini-3.8-flash   # any model your key can use, e.g. a current "flash" model
   ```
3. Restart `npm run dev`. The terminal prints `Gemini: live (<model>)` and the header pill switches to **Gemini: Live** after the first successful call.

The key is read only by the dev server, a Vite middleware in `server/`. It is never bundled into or sent to the browser, and `.env` is git-ignored.

**Free-tier friendly.** The 24 block decisions go to Gemini as one batched request (structured JSON output with a response schema). Each chat question is one request. Rate-limit errors (429/503) are retried once. Anything that still fails falls back to the cache or the rule-based logic, so the demo never breaks on stage.

### Regenerate the Gemini cache

```bash
npm run cache-gemini                    # real Gemini calls for the default scenario (needs GEMINI_API_KEY)
npm run cache-gemini -- --placeholder   # rule-based texts, no API calls
```

This writes `src/data/gemini-cache.json`, which holds the 24 decisions plus answers to the four preset chat questions for the default fan block at minute 8, the moment Pitch Mode shows. It is used when there is no key or a live call fails. **Run it with your key before the pitch**, so the offline mode shows real Gemini texts. The shipped file is a rule-based placeholder, and the UI labels it as "Rule-based fallback", not as Gemini.

---

## What's in the app

| Tab | What it shows |
|---|---|
| **Simulation** | Top-down map of the real site, drawn from OpenStreetMap: the Allianz Arena outline, Esplanade on the garage roof, bridge and stairs into Fröttmaning, U-Bahn tracks and depot, Busparkplatz Mitte, Gästeparkhaus, A9/A99. Two scenarios run side by side (or as one large map) on one shared timeline: play/pause, 1×/5×/20×, scrub. Each dot is about 10 fans, coloured by density. Live counters sit under each map. |
| **Comparison** | Headline deltas (AI exit waves vs. everyone at once), plus platform queue, station-approach density with the safety line, the shuttle herding effect, fans home over time, and a full metrics table. |
| **AI Decisions** | The U6 capacity plan per 5-minute slot and all 24 blocks (segment mix, wave, route, incentive, planned vs. simulated acceptance). Click a block for its **decision trace**: inputs → optimizer output (incl. rejected slots) → Gemini's incentive and explanation (and any validator correction) → final fan message. |
| **Fan App** | Phone mockup for a fan in a chosen block: personal message, countdown to the wave, "leave now vs. leave with my wave" (home time and minutes in the crowd), reward, and the **Ask the stadium** chat. Next to it is the exact state Gemini is given. |
| **Settings** | Every parameter, with an *assumption* badge: match context, seed, U6, shuttles, car parks, “same tip for all” app, optimizer, reward budget, segment acceptance and travel modes. |
| **Pitch Mode** | Header button. Five guided steps (problem → same tip for all fails → AI exit waves → how Gemini decides → what the fan sees), each with a spotlight and a caption that uses the live numbers. Keys: ← → Esc. |

The **Ask the stadium** chatbot is available on every tab (floating button) and inside the phone. It answers exit questions only from the current simulation state, and answers general matchday questions without inventing facts.

---

## How it works

```
config ──► population (seeded) ──► optimizer ──► Gemini (incentive + texts) ──► validator ──► simulation ×3 ──► UI
                                    waves/routes      /api/decisions              budget        Web Worker
```

### Simulation model (`src/sim/simulate.ts`)

The model is agent-based (one agent = one fan) with 30-second steps over 240 minutes. Each fan moves through these stages: seat → gate → walk → queue → ride → home.

- **Esplanade:** walkers slow down with density (Greenshields).
- **Station:** Fröttmaning holds `platformCapacity` people. Everyone beyond that is held on the station approach (bridge and stairs), and that density is the safety metric. One train every 2.5 min takes up to 940 people; an overcrowded station loses 12% of that capacity.
- **Shuttles:** 20 buses × 90 seats, 20-min round trip.
- **Car parks:** 11,000 vehicles, about 150 min to clear.
- **Coaches & other:** coaches, taxis, bikes and walkers leave without a modelled bottleneck.
- **Match context:** the result and weather shift the log-normal natural leaving curve (fans linger after a win and hurry in rain or cold). Away fans (Nordkurve, blocks N3/N4) leave by the separated Esplanade Süd lane and are never re-routed.

### Three scenarios on identical seeds

1. **Everyone at once:** everyone leaves on the natural curve by their usual route.
2. **Same tip for all:** every 10 minutes the app tells all users the route that is *currently* fastest. At the whistle the bus stop is empty, so thousands are sent there and the shuttle becomes the slowest route.
3. **AI exit waves:** the optimizer plans waves and routes, and acceptance decides who actually follows.

### Optimizer (`src/sim/optimizer.ts`): greedy time-slot capacity allocation

1. Cut time into 5-min slots. Each resource has a capacity per slot: U6 = 940/2.5 min, shuttle = buses × seats / round trip, both with a 5% safety margin.
2. Book the uncontrollable load first: away fans, plus the *expected* share of fans who won't follow advice, spread over the natural curve.
3. Sort blocks by wait aversion (families first). For each block, evaluate every candidate (start slot, window of 1–3 slots, U6 or shuttle) with the queue recursion `q[s+1] = max(0, q[s] + load[s] − cap[s])`. A candidate is feasible only if it never pushes the projected queue above target in any slot it changes. Pick the cheapest feasible candidate:
   `cost = ½·waitAversion·minutes in stadium + walk + 1.5·queue wait + ride`.
4. Gemini then picks the incentive for each block from the allowed list. The validator checks the choice against the reward budget (store points, café places, lottery pool, minimum delays). An invalid choice is replaced by the rule-based best option and logged.
5. The simulation applies per-segment acceptance (app adoption × acceptance per incentive), so not everyone follows.

**Gemini never sets timings or routes.** It explains, personalises and chooses incentives, and the optimizer stays deterministic and testable.

### Gemini integration (`server/gemini.ts`, `src/gemini/`)

- Official `@google/genai` SDK, server-side only. Model from `GEMINI_MODEL`.
- **Decisions** come back as structured JSON via `responseMimeType: application/json` plus `responseJsonSchema`:
  `{ blockId, incentive, incentiveReason, decisionExplanation, fanMessage (≤ 200 chars), language }`.
- **Chat:** the system prompt restricts exit answers to numbers in the provided `STATE`. General questions are allowed, without invented prices, times or other specifics.
- **Fallback chain:** live → cache (default scenario) → rule-based. Each text carries a badge showing its source.

---

## Tests and quality

```bash
npm test          # vitest: optimizer + Gemini validation
npm run typecheck # tsc --noEmit
npm run build     # typecheck + production bundle
```

The tests check that:

- planned waves never push queues above capacity (default, rain/loss, low adoption, tight targets);
- away-fan routes never change (in the plan and in every simulated scenario);
- the same seed gives identical plans and results;
- invalid Gemini incentives are corrected and logged;
- messages are capped at 200 characters.

---

## Project structure

```
server/            Vite middleware (/api/status, /api/decisions, /api/chat) + Gemini calls
scripts/           cache-gemini.ts (offline cache), build-map.ts (OSM → site-geometry.json)
src/sim/           config, seeded population, optimizer, simulation, incentives, Web Worker
src/gemini/        request building, validation, rule-based fallback, browser client
src/components/    UI: tabs, map renderer (canvas), chat, pitch mode
src/data/          gemini-cache.json
tests/             vitest suites
```

### Map data

`src/components/map/site-geometry.json` is generated from OpenStreetMap by `npx tsx scripts/build-map.ts` and committed, so the app needs no network access. Map data © OpenStreetMap contributors (ODbL). The map is a stylised rendering; no official maps, crests, logos or player images are used. Walking routes follow the mapped footways (Esplanade on the garage roof, bridge and stairs to the station). Gate positions and the away-lane separation are simplified.

### Sources for the site layout

- Fröttmaning station is south-west of the arena; the Esplanade leads from the station's northern bridge to the stadium ([Wikipedia: Fröttmaning station](https://en.wikipedia.org/wiki/Fr%C3%B6ttmaning_station)).
- There are four parking garages with 9,800 spaces under the Esplanade, plus about 1,200 at the stadium, and 350 bus spaces ([Wikipedia: Allianz Arena](https://en.wikipedia.org/wiki/Allianz_Arena)).
- The away entrance is on the north side, and away fans leave via the Esplanade Süd to the U-Bahn (club fan information, e.g. [BVB](https://www.bvb.de/News/Uebersicht/Faninfos-fuer-das-Auswaertsspiel-beim-FC-Bayern-Muenchen) and [TSG Hoffenheim](https://www.tsg-hoffenheim.de/en/news/overview/2023/04/for-information-for-the-match-in-munich)).
