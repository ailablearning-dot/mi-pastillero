package com.mipastillero.app;

import android.app.KeyguardManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationManagerCompat;

/**
 * La pantalla que sale encima del bloqueo cuando toca una dosis.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────────────────────
 * Samsung deja elegir cómo se ven las notificaciones en la pantalla de bloqueo, y una de las
 * opciones es "Sólo ícono". Con ella, «Hora de tomar Rivarixaban» queda reducido a un punto de
 * cinco milímetros entre otros cuatro: suena, pero no se lee. Comprobado en un Galaxy A06 el
 * 2026-09-24, y ese ajuste NO se puede consultar desde una app —Samsung lo guarda donde no
 * llegamos—, así que no basta con avisar de que está mal puesto: hay que saltárselo.
 *
 * ── POR QUÉ NO ES LA APP ENTERA ───────────────────────────────────────────────────────────────
 * El primer intento apuntó la notificación a pantalla completa a MainActivity. Funcionaba, pero
 * dejaba la lista completa de medicamentos —y de personas— a la vista de cualquiera que tuviera
 * el teléfono en la mano, sin desbloquearlo. Esta pantalla enseña UNA dosis y nada más. Es
 * también lo que Play espera de una notificación a pantalla completa: una alarma, no un atajo
 * para saltarse el bloqueo.
 *
 * ── LAS DOS LÍNEAS QUE LO HACEN FUNCIONAR ─────────────────────────────────────────────────────
 * setShowWhenLocked + setTurnScreenOn. Sin ellas el sistema SÍ lanza la actividad —se ve en el
 * logcat abriendo la ventana— pero con la pantalla apagada la para 200 ms después y no se entera
 * nadie. Es exactamente lo que pasó en la primera prueba.
 */
public class AlarmaActivity extends AppCompatActivity {

    public static final String EXTRA_TITULO = "alarma_titulo";
    public static final String EXTRA_CUERPO = "alarma_cuerpo";
    public static final String EXTRA_NOTIF_ID = "alarma_notif_id";

    private int notifId = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow()
                .addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                );
        }
        // Que la pantalla se encienda de verdad y no se apague mientras la persona la lee: quien
        // se acaba de despertar tarda en entender qué está viendo.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_alarma);
        pintar(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pintar(intent);
    }

    private void pintar(Intent intent) {
        if (intent == null) return;
        String titulo = intent.getStringExtra(EXTRA_TITULO);
        String cuerpo = intent.getStringExtra(EXTRA_CUERPO);
        notifId = intent.getIntExtra(EXTRA_NOTIF_ID, -1);

        TextView tCuerpo = findViewById(R.id.alarma_cuerpo);
        // El cuerpo YA dice "Hora de tomar X"; el título del sistema es solo el nombre de la app,
        // que aquí no aporta nada y robaría la línea que de verdad importa.
        tCuerpo.setText(cuerpo != null && !cuerpo.isEmpty() ? cuerpo : titulo);

        Button abrir = findViewById(R.id.alarma_abrir);
        abrir.setOnClickListener(v -> {
            // Marcar la toma vive en JavaScript, con sus reglas (fracciones, inventario, la cola
            // offline). Duplicarla aquí en Java sería tener dos verdades. Se abre la app, que es
            // donde está escrita una sola vez.
            cerrarAviso();
            // ⚠️ SE DISPARA EL MISMO INTENT QUE UN TOQUE EN LA NOTIFICACIÓN, no uno propio.
            // La primera versión hacía `new Intent(this, MainActivity.class)` y la persona
            // aterrizaba en la lista del día sin la pregunta de marcar o posponer: el aviso que
            // dice QUÉ dosis es viaja dentro del intent de la notificación, y uno nuevo no lo
            // lleva. Reportado por José el 2026-09-25 con la Aspirina de las 15:00.
            PendingIntent pi = null;
            try {
                pi = Build.VERSION.SDK_INT >= 33
                    ? intent.getParcelableExtra("alarma_abrir", PendingIntent.class)
                    : (PendingIntent) intent.getParcelableExtra("alarma_abrir");
            } catch (Exception e) {
                android.util.Log.w("AlarmaActivity", "no vino el intent de la notificación: " + e.getMessage());
            }
            if (pi != null) {
                try { pi.send(); } catch (PendingIntent.CanceledException e) { pi = null; }
            }
            if (pi == null) {
                // Respaldo: mejor abrir la app sin el modal que no abrir nada.
                Intent i = new Intent(this, MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(i);
            }
            // Si el teléfono tiene clave, esto pide desbloquear ANTES de enseñar nada.
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                km.requestDismissKeyguard(this, null);
            }
            finish();
        });

        Button luego = findViewById(R.id.alarma_luego);
        // "Ahora no" NO retira la notificación, y es deliberado: al cerrar esta pantalla, ese
        // aviso en la barra pasa a ser el único rastro de que la dosis sigue pendiente. Quitarlo
        // sería borrarle la prueba a quien acaba de decir "luego". Solo se retira al abrir la app,
        // que es donde puede marcarla.
        luego.setOnClickListener(v -> finish());
    }

    // Solo desde "Abrir Mi Pastillero": allí la persona ya está delante de la dosis y puede
    // marcarla, así que el aviso de la barra ha cumplido. Desde "Ahora no" se queda a propósito.
    private void cerrarAviso() {
        if (notifId >= 0) {
            NotificationManagerCompat.from(this).cancel(notifId);
            android.util.Log.i("AlarmaActivity", "aviso retirado id=" + notifId);
        } else {
            android.util.Log.w("AlarmaActivity", "sin id de notificación en el intent");
        }
    }
}
