This directory contains Vercel Serverless Functions.

Endpoints:
- POST /api/run/start
- POST /api/leaderboard/submit
- GET /api/leaderboard?limit=10

Required env vars (server-only):
- RUN_TOKEN_SECRET

Redis (choose one option):
- Option A (Upstash):
  - UPSTASH_REDIS_REST_URL
  - UPSTASH_REDIS_REST_TOKEN
- Option B (Vercel KV-compatible):
  - KV_REST_API_URL
  - KV_REST_API_TOKEN
