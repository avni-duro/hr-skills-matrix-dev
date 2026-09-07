// Edge Function: admin-create-user
// Creates an auth user (requires SERVICE ROLE) then inserts profile row in public.users
// Deploy: supabase functions deploy admin-create-user --no-verify-jwt
// Invocation from client uses supabase.functions.invoke('admin-create-user', { body: {...} })

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
}

const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false }
});

interface CreateUserPayload {
  email: string;
  password?: string; // optional (if omitted, a random password is generated)
  full_name?: string;
  role?: string; // 'user' | 'admin' | 'trainer'
  employee_id: string;
  department?: string;
  phone?: string;
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const payload: CreateUserPayload = await req.json();
    const { email, password, full_name, role, employee_id, department, phone } = payload;

    if (!email || !employee_id) {
      return new Response(JSON.stringify({ error: 'email and employee_id are required' }), { status: 400 });
    }

    const finalPassword = password || crypto.randomUUID();

    // Create auth user
    const createRes = await admin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { full_name, role, employee_id, department, phone }
    });

    if (createRes.error) {
      return new Response(JSON.stringify({ error: createRes.error.message }), { status: 400 });
    }

    const userId = createRes.data.user.id;

    // Insert profile row (service role bypasses RLS)
    const profileRes = await admin
      .from('users')
      .insert({
        id: userId,
        full_name: full_name || email.split('@')[0],
        email,
        role: role || 'user',
        employee_id,
        department: department || null,
        phone: phone || null
      })
      .select()
      .single();

    if (profileRes.error) {
      return new Response(JSON.stringify({ error: profileRes.error.message, userId }), { status: 400 });
    }

    return new Response(JSON.stringify({ userId, profile: profileRes.data }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400 });
  }
});
