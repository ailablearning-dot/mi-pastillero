// Edge Function: delete-account
// Borra la cuenta del usuario y TODOS sus datos. Requisito de App Store
// (guía 5.1.1(v): apps con registro deben permitir eliminar la cuenta in-app).
//
// Se invoca desde la app (SettingsScreen) con:
//   supabase.functions.invoke("delete-account")  // usa el token de sesión
//
// verify_jwt=true: el gateway valida el JWT; aquí derivamos el user.id del token
// (no del cliente) y luego usamos el SERVICE ROLE para borrar datos + usuario.
// SUPABASE_SERVICE_ROLE_KEY lo inyecta Supabase automáticamente en Edge Functions.
//
// Desplegado en mi-pastillero-dev (hylwfravrxnlifxefuey). Replicar en prod.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_authorization' }, 401);

  // 1) Validar el JWT del usuario y obtener su id desde el token (no del cliente).
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user?.id) return json({ error: 'invalid_user' }, 401);

  // 2) Cliente admin (service role) para borrar datos y el usuario de Auth.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const uid = user.id;

  // 3) Borrar los datos del usuario (hijos primero). Filtrado por user_id.
  for (const table of ['medicamentos', 'pastillas', 'pacientes']) {
    const { error } = await admin.from(table).delete().eq('user_id', uid);
    if (error) return json({ error: `delete_${table}_failed`, detail: error.message }, 500);
  }

  // 4) Borrar el usuario de Auth (esto invalida sus sesiones).
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return json({ error: 'delete_user_failed', detail: delErr.message }, 500);

  return json({ ok: true });
});
