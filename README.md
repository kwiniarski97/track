# Track

A self-hosted, multi-user tracker for TV shows and movies. SvelteKit PWA with
offline-first watch tracking, TMDB metadata, Jellyfin watch-status sync, and
SSO via Pocket ID.

## Features

- Track watched movies and episodes, browse a calendar of upcoming episodes/releases
- Works offline — marking things watched queues locally and syncs when back online
- Auto-syncs watch status from Jellyfin playback history (matched via TMDB provider IDs)
- Import watch history from a TV Time export
- Profile page with watch-time stats and completed shows/movies
- Single-user-per-instance-friendly, but supports multiple accounts via SSO

## Stack

- **SvelteKit** (adapter-node) for both the frontend (PWA) and backend
- **SQLite** via Drizzle ORM — a single file, no separate DB service
- **TMDB** for show/movie/episode metadata
- **Pocket ID** (OIDC) for authentication, via `arctic`
- **Paraglide JS** for i18n (currently `pl`, `en`)
- **croner** for in-process scheduled jobs (no Redis/queue)

## Developing

Install dependencies and copy the env template:

```sh
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | path to the SQLite file, e.g. `local.db` |
| `ORIGIN` | public origin required by SvelteKit's adapter-node; must be the real HTTPS origin in production |
| `BODY_SIZE_LIMIT` | default `20M`; the 512K default is too small for a TV Time export zip upload |
| `SESSION_SECRET` | random secret used to sign session cookies |
| `TMDB_API_KEY` | from https://www.themoviedb.org/settings/api |
| `POCKET_ID_ISSUER`, `POCKET_ID_CLIENT_ID`, `POCKET_ID_CLIENT_SECRET` | from an OIDC client created in your Pocket ID instance |
| `JELLYFIN_URL`, `JELLYFIN_API_KEY` | optional, enables Jellyfin watch-status sync |

Push the schema and start the dev server:

```sh
npm run db:push
npm run dev
```

Other useful scripts:

```sh
npm run check       # svelte-check
npm run lint        # prettier + eslint
npm run test         # vitest
npm run db:studio   # Drizzle Studio
```

## Building & deploying

```sh
npm run build
```

Production images are built for `linux/amd64` and `linux/arm64` and published
to `ghcr.io/kwiniarski97/track` on every push to `main` (see
`.github/workflows`).

To run with Docker Compose, using the pre-built image:

```sh
cp .env.example .env   # fill in the same variables as above
docker compose -f docker-compose.prod.yml up -d
```

`docker-compose.yml` builds the image locally instead, for testing Dockerfile
changes. In both cases the SQLite database lives on the `./data` bind mount,
so it survives container recreation.
