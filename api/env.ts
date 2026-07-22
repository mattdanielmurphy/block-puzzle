import type { VercelRequest, VercelResponse } from "@vercel/node"

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    MY_DB_URL: process.env.MY_DB_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    SUPABASE_URL: process.env.SUPABASE_URL
  });
}

