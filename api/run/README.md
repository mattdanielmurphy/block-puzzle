# /api/run

This directory contains Vercel Serverless Functions related to game run management.

## Endpoints

-   `GET /api/run/start`
    -   Initializes a new game run, returning a `runId` and `seed` (for the game engine).
    -   Optionally, a client can pass a `seed` parameter to request a specific seed.
    -   Authenticates the `runId` with a signed `runToken` which includes the seed.
    -   Returns: `{ runId: string, runToken: string, seed: number }`
-   `POST /api/leaderboard/submit`
-   `GET /api/leaderboard?limit=10`
