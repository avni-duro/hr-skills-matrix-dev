// Supabase Edge Function: send-notification (FCM v1)
// Deno runtime
// WARNING: Do not commit actual private key values. Set them via `supabase functions secrets set`.
// Secrets expected:
//  - FCM_PROJECT_ID
//  - FCM_CLIENT_EMAIL
//  - FCM_PRIVATE_KEY (include -----BEGIN PRIVATE KEY----- / END lines, replace newlines with \n when setting)
//  - SUPABASE_SERVICE_KEY (service role key)
//  - SUPABASE_URL (https://xxxx.supabase.co)
//
// Expects Supabase DB Webhook POST body shape: { type: 'INSERT', table: 'notifications', record: {...} }
// notifications table columns: id, title, body, user_id (nullable for broadcast), data (jsonb), status, sent_at, error_message
// device tokens table: user_device_tokens (user_id, fcm_token)
//
// FCM v1 requires OAuth2 access token created via service account JWT.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
 
interface NotificationRow {
  id: string;
  title: string;
  body: string;
  user_id: string | null;
  data: Record<string, unknown> | null;
}

const PROJECT_ID = Deno.env.get("FCM_PROJECT_ID")?.trim();
const CLIENT_EMAIL = Deno.env.get("FCM_CLIENT_EMAIL")?.trim();
let PRIVATE_KEY = Deno.env.get("FCM_PRIVATE_KEY")?.trim() || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim();
// Accept both common env names
const SERVICE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY"))?.trim();

// Normalize private key escaping (replace literal \n with real newlines)
PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, "\n");

if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing required secrets for send-notification function.", {
    hasProjectId: !!PROJECT_ID,
    hasClientEmail: !!CLIENT_EMAIL,
    hasPrivateKey: !!PRIVATE_KEY,
    hasSupabaseUrl: !!SUPABASE_URL,
    hasServiceKey: !!SERVICE_KEY,
  });
}

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: CLIENT_EMAIL,
    scope: FCM_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600, // 1 hour
  };
  function base64url(input: string): string {
    return btoa(input).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  const encoder = new TextEncoder();
  const toSign = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(toSign));
  const jwt = `${toSign}.${arrayBufferToBase64Url(signature)}`;

  // Exchange JWT for access token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  // Use Deno's built-in base64 decoder instead of atob
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function fetchTokens(userId: string | null): Promise<string[]> {
  const filter = userId ? `?user_id=eq.${userId}` : ""; // broadcast if null
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_device_tokens${filter}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) {
    console.error("Token fetch failed", await res.text());
    return [];
  }
  const rows = await res.json();
  // Deduplicate tokens
  const tokens = Array.from(new Set(rows.map((r: any) => r.fcm_token as string).filter(Boolean)));
  console.log(`Fetched ${tokens.length} device token(s) for`, userId ? `user ${userId}` : 'broadcast');
  return tokens as string[];
}

async function updateStatus(id: string, status: string, error?: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/notifications?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ status, sent_at: status === "sent" ? new Date().toISOString() : null, error_message: error || null }),
  });
}

async function sendMessage(accessToken: string, token: string, row: NotificationRow) {
  // Helper to convert all data keys to strings, as required by FCM
  const flattenDataToStrings = (data: Record<string, unknown> | null): Record<string, string> => {
    if (!data) return {};
    const stringData: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      // Check for valid keys and convert all values to strings
      if (key) {
        stringData[key] = String(value);
      }
    }
    return stringData;
  };

  const dataPayload = flattenDataToStrings(row.data);
  
  const message = {
    message: {
      token,
      notification: { title: row.title, body: row.body },
      data: dataPayload, // Use the cleaned and flattened data
      android: { priority: "high" },
      apns: { headers: { "apns-priority": "10" } },
    },
  };
  
  const res = await fetch(FCM_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 500));
  }
}

async function processNotification(row: NotificationRow) {
  const tokens = await fetchTokens(row.user_id);
  if (tokens.length === 0) {
    await updateStatus(row.id, "error", "No device tokens");
    return;
  }
  try {
    const accessToken = await getAccessToken();
    // Send sequentially (can optimize with Promise.all; keep sequential for rate clarity)
    for (const t of tokens) {
      try {
        await sendMessage(accessToken, t, row);
      } catch (e) {
        console.error("FCM send failed for token", t, e);
      }
    }
    await updateStatus(row.id, "sent");
  } catch (e) {
    console.error("Notification processing error", e);
    await updateStatus(row.id, "error", String(e));
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { 
      status: 405,
      headers: corsHeaders 
    });
  }

  try {
    const payload = await req.json();
    const row: NotificationRow | undefined = payload.record;
    if (!row) {
      return new Response("Missing record", { 
        status: 400,
        headers: corsHeaders 
      });
    }
    if (!row.title || !row.body) {
      return new Response("Invalid notification data", { 
        status: 400,
        headers: corsHeaders 
      });
    }

    // Only handle pending notifications
    await processNotification(row);
    return new Response("OK", { 
      status: 200,
      headers: corsHeaders 
    });
  } catch (e) {
    console.error("Unhandled error", e);
    return new Response("Server Error", { 
      status: 500,
      headers: corsHeaders 
    });
  }
});
