import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SEEDED_SLUGS = ["roger", "chopper", "ap-5", "ig-11", "k-2so", "yoda", "cartier", "r5-d4"];

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function hash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function slugs(): Promise<string[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return SEEDED_SLUGS;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.from("agents").select("slug,sort_order").order("sort_order");
  if (error || !data?.length) {
    console.error(`Could not read agents (${error?.message ?? "none returned"}). Using the seeded slug list.`);
    return SEEDED_SLUGS;
  }
  return data.map((row) => String(row.slug));
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const names = await slugs();
console.log("-- Agent HQ API keys");
console.log("-- Plaintext keys are printed once, to this terminal only. They are not written to a file.");
console.log("-- Run the UPDATE statements in the Supabase SQL editor.");
console.log("");
for (const slug of names) {
  const token = `ahq_${randomBytes(32).toString("base64url")}`;
  const digest = hash(token);
  const safeSlug = slug.split("'").join("''");
  console.log(`-- ${slug}`);
  console.log(`-- key: ${token}`);
  console.log(`update agents set api_key_hash = '${digest}' where slug = '${safeSlug}';`);
  console.log("");
}
