# Pay Dirt — 1849 California Gold Rush (Browser MMO Prototype)

This is a **static, GitHub Pages–friendly** prototype that demonstrates the core loops for an eventual MMO:
prospecting & panning for gold, selling to the market, buying equipment, training skills, and running a basic business (general store).

- **Frontend only**: a single-page app with vanilla JS + CSS, no build step.
- **Deterministic world**: generated from a seed so everyone shares the same map once we add a backend.
- **Local save**: game state is saved in your browser's `localStorage`.

> MMO bits (accounts, realtime market, shared claims) are designed to plug into **Supabase** with Postgres + Realtime. See `supabase.sql` for schema and notes.

---

## Quick Start (GitHub Pages)

1. Create a new GitHub repo, e.g. `paydirt`.
2. Upload the files in this folder to the repo root (or use the zip from ChatGPT).
3. Enable **GitHub Pages** (Settings → Pages → Source: `main` + root).
4. Visit your GitHub Pages URL. The prototype should run immediately.

No build tools, no Node required.

---

## Controls & Loops

- Click tiles to **select**; use **Prospect**, **Pan**, or **Sluice** (needs a Sluice) to extract gold.
- **Sell Gold** to the market; spot price shifts based on supply/demand (very simplified).
- Buy **equipment** to boost yields; train skills by using actions.
- Open a **General Store** and tune prices. Click **Simulate NPC demand** to test an economy loop.
- **Save** writes to your browser; **Reset** clears the save.

---

## Project Structure

```
.
├── index.html       # UI shell
├── style.css        # Minimal, clean styling
├── main.js          # World gen, actions, economy, UI
├── assets/
│   └── pickaxe.svg
├── supabase.sql     # DB schema & RLS outline
└── README.md
```

---

## Next Steps (MMO)

When you're ready to go multiplayer:

1. Create a Supabase project.
2. Run `supabase.sql` in the SQL editor.
3. Replace the "local-only" state with DB reads/writes:
   - `world.tiles` → `tiles` table (lazy materialization per coordinate).
   - `player` → `profiles`, `characters`, `inventories`.
   - `market` → `orders` (limit order book or a simple ticker), `trades`.
   - `claims` → `claims` with uniqueness constraints.
4. Subscribe to Realtime on `tiles`, `orders`, `claims` to reflect others' actions.
5. Enforce **Row Level Security** policies (examples included).

---

## License

MIT. Go find some pay dirt.
