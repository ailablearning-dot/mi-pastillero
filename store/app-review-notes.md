# App Review Notes — Mi Pastillero

Texto para pegar en **App Store Connect → (versión) → App Review Information → Notes**
cuando se envíe a revisión. NO capturar en ASC antes del envío (solo se usa al enviar,
y los datos de la cuenta demo son placeholders hasta que se cree en prod).

## Notas para el revisor (pegar tal cual, en inglés)

```
Mi Pastillero is a medication reminder app. Users add their medications
(name, dose, schedule) and the app sends local notifications at each dose
time. It supports managing medications for multiple people (e.g., a caregiver
managing a family member's medications), a history/report exportable to Excel,
and an optional Face ID lock. The app UI is in Spanish (the app targets Mexico).

DEMO ACCOUNT (full access, pre-populated with sample data):
Email: [DEMO_EMAIL]
Password: [DEMO_PASSWORD]
This account already has full premium access, so you can review all features
immediately without any purchase.

SUBSCRIPTION / PAYWALL:
The app is free to download and offers an auto-renewable subscription with a
7-day free trial (weekly / monthly / annual plans). New users see a paywall
after signing in. The demo account above bypasses the paywall (full access,
no purchase required). If you wish to test the purchase flow, you can start
the 7-day free trial from the paywall in the Sandbox environment.

SIGN IN:
The app offers email/password, "Continue with Google," and "Continue with
Apple" (Sign in with Apple). Please use the demo email/password above.

ACCOUNT DELETION:
Users can permanently delete their account and all associated data from
Settings ("Ajustes") → "Eliminar cuenta" (Delete account).

ADDITIONAL NOTES:
- Reminders are delivered as local notifications; notification permission is
  requested on first use.
- The app is a reminder/organization tool and is NOT a medical device; it does
  not provide medical advice or diagnosis.

Contact: ailab.learning@gmail.com
```

## Checklist al momento del envío (crear la cuenta demo)

1. Crear el usuario demo en **PROD** (`kbsxjdtdleauzvbtbrqi`) — por el dashboard (Auth → Add user)
   o registrándolo desde un build apuntando a prod. Anotar email + password.
2. Poblar la cuenta con datos de ejemplo (1 paciente + varias pastillas) por SQL
   (mismo enfoque que el paciente demo "Mau" de los screenshots).
3. Darle **entitlement `premium` de cortesía** en RevenueCat a esa cuenta (para que
   bypasee el paywall). RevenueCat → Customers → [el UUID de Supabase del demo] → Grant.
   (Requiere que la cuenta haya entrado una vez para existir como customer en RC.)
4. Rellenar `[DEMO_EMAIL]` / `[DEMO_PASSWORD]` arriba y pegar en App Review Information.
5. Rellenar también el App Review contact info (nombre, email, teléfono).
