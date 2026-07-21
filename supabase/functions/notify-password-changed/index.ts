// Edge Function: notify-password-changed
// Envía un correo de seguridad "Tu contraseña fue actualizada" tras un cambio
// de contraseña exitoso. Se invoca desde la app (LoginScreen.handleReset) con
// supabase.functions.invoke("notify-password-changed") usando el token de sesión.
//
// verify_jwt=true: el gateway valida el JWT; aquí derivamos el email del token
// (no del cliente) para no poder falsificar el destinatario.
//
// Requiere el secret RESEND_API_KEY (Dashboard → Edge Functions → Secrets).
// Desplegado en mi-pastillero-dev (hylwfravrxnlifxefuey). Replicar en prod.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function emailHtml() {
  const icon = 'https://ailablearning-dot.github.io/mi-pastillero/icon-512.png';
  return `
  <div style="max-width:420px; margin:0 auto; font-family:Arial,Helvetica,sans-serif; color:#1f2937;">
    <div style="text-align:center; padding:24px 0;">
      <img src="${icon}" width="64" height="64" alt="Mi Pastillero" style="border-radius:16px; display:inline-block;" />
      <h1 style="font-size:20px; margin:12px 0 0; color:#111827;">Mi Pastillero</h1>
    </div>
    <div style="background:#ffffff; border:1px solid #eee; border-radius:16px; padding:24px; text-align:center;">
      <h2 style="font-size:17px; margin:0 0 8px;">Tu contraseña fue actualizada</h2>
      <p style="font-size:14px; color:#6b7280; margin:0 0 16px;">Te confirmamos que la contraseña de tu cuenta de Mi Pastillero se cambió correctamente.</p>
      <p style="font-size:13px; color:#9ca3af; margin:0;">Si <strong>no fuiste tú</strong>, restablece tu contraseña de inmediato desde la app usando la opción "¿Olvidaste tu contraseña?".</p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_authorization' }, 401);

  // Valida el JWT del usuario y obtiene su email desde el token (no del cliente).
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return json({ error: 'invalid_user' }, 401);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return json({ error: 'resend_key_not_configured' }, 500);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Mi Pastillero <noreply@pastillero.jimbera.com>',
      to: [user.email],
      subject: 'Tu contraseña fue actualizada',
      html: emailHtml(),
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    return json({ error: 'resend_failed', detail }, 502);
  }
  return json({ sent: true });
});
