package com.mipastillero.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lo que hace falta para que un recordatorio llegue de verdad en Android, y que no se puede
 * consultar desde JavaScript.
 *
 * Es un plugin DE ESTA APP, no una librería: son cuatro métodos y todos existen por una razón
 * concreta de producto, no por generalidad.
 *
 * ⚠️ UNA DECISIÓN DE POLÍTICA, NO DE CÓDIGO. Para la exención de batería, Android ofrece un diálogo
 * de un solo toque (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS), pero exige declarar el permiso
 * REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, que Google Play tiene RESTRINGIDO y hay que justificar —
 * con riesgo de rechazo. Aquí se usa la vía sin permiso: se abre la ficha de la app en los ajustes
 * del sistema, desde donde la batería queda a dos toques. Peor experiencia, cero riesgo de política.
 * Es cambiable el día que se decida asumir esa declaración.
 */
@CapacitorPlugin(name = "Permisos")
public class PermisosPlugin extends Plugin {

    /** Todo el estado de una vez: la pantalla lo pinta entero y no quiere cuatro llamadas. */
    @PluginMethod
    public void estado(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();

        r.put("notificaciones", NotificationManagerCompat.from(ctx).areNotificationsEnabled());

        boolean bateriaLibre = true; // antes de Android 6 no existe el concepto
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            bateriaLibre = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        r.put("bateria", bateriaLibre);

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        r.put("noMolestar", nm != null && nm.isNotificationPolicyAccessGranted());

        // En minúsculas: la marca viene escrita de formas distintas según el fabricante
        // ("Xiaomi", "xiaomi", "HUAWEI") y compararla en crudo falla en la mitad de los teléfonos.
        r.put("fabricante", String.valueOf(Build.MANUFACTURER).toLowerCase());
        r.put("modelo", String.valueOf(Build.MODEL));
        call.resolve(r);
    }

    /**
     * La exención de batería, en UN TOQUE. Android enseña su propio diálogo encima de la app
     * ("¿Permitir que Mi Pastillero ignore las optimizaciones de batería?") y con eso basta.
     *
     * Requiere el permiso REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, que Play tiene restringido. Si
     * algún día hay que quitarlo, este método NO deja de funcionar: cae solo a la ficha de la app
     * en los ajustes, que es el camino largo pero seguro. Por eso el catch no es decorativo.
     */
    @PluginMethod
    public void pedirExencionBateria(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            // Ya está concedido: no se le enseña un diálogo a quien ya dijo que sí.
            if (pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) {
                call.resolve();
                return;
            }
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + ctx.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                call.resolve();
                return;
            } catch (Exception e) {
                // Sin el permiso declarado, o en un teléfono que no ofrece ese diálogo.
            }
        }
        abrirAjustesDeLaApp(call);
    }

    /** La ficha de la app en los ajustes: desde ahí, batería a dos toques. Es el respaldo. */
    @PluginMethod
    public void abrirAjustesDeLaApp(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no_se_pudo_abrir", e);
        }
    }

    /**
     * Retira todos los avisos de la app que estén en la persiana.
     *
     * POR QUÉ EXISTE, ADEMÁS DEL MÉTODO DEL PLUGIN: porque el del plugin no da confianza en
     * Android. `getDeliveredNotifications()` devuelve CERO con un aviso delante en la persiana
     * —comprobado llamándolo directamente en el Galaxy A06 el 2026-09-26—, así que algo no ve.
     * Éste usa el contexto de la app sin intermediarios.
     *
     * ⚠️ NOTA DE MÉTODO, que costó una hora: NO se puede comprobar esto con `dumpsys notification`.
     * Ese volcado incluye registros HISTÓRICOS que parecen avisos vivos, y me llevó a concluir
     * tres veces que nada funcionaba cuando la persiana estaba limpia. Se comprueba abriendo la
     * persiana y leyéndola (`cmd statusbar expand-notifications` + uiautomator).
     *
     * PARA QUÉ HACE FALTA: en Android, una vez que un aviso suena, el sonido va hasta el final
     * —y son 28 segundos— aunque abras la app. Retirar la notificación es lo único que lo corta.
     * En iOS no hacía falta porque lo hace el sistema al abrir desde el aviso.
     *
     * Se lleva también los recordatorios de citas ya entregados. Se acepta: uno que YA SONÓ ha
     * cumplido, y la cita sigue en su pestaña. Es además lo que hace iOS.
     */
    @PluginMethod
    public void limpiarAvisos(PluginCall call) {
        try {
            NotificationManagerCompat.from(getContext()).cancelAll();
            call.resolve();
        } catch (Exception e) {
            call.reject("no_se_pudo_limpiar", e);
        }
    }

    /**
     * Los Ajustes del teléfono, en su pantalla de inicio.
     *
     * Es el destino de la tarjeta de fabricante, y es deliberadamente tonto: el menú al que hay que
     * llegar (en Samsung, Cuidado del dispositivo → Batería → Límites de uso en segundo plano) SÍ
     * tiene una acción propia —com.samsung.android.sm.ACTION_START_APP_POWER_MANAGEMENT_SETTING—
     * pero lanzarla desde aquí devuelve SecurityException: Samsung la protege con el permiso de
     * sistema READ_SEARCH_INDEXABLES, que una app de tienda no puede tener. Comprobado en el A06.
     *
     * Así que no se finge una puerta que no existe: se abre Ajustes, que es exactamente donde
     * empieza el paso 1 que la tarjeta tiene escrito encima, y la persona sigue leyendo.
     */
    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no_se_pudo_abrir", e);
        }
    }

    /**
     * El acceso a la política de notificaciones, que es lo que permite saltarse el No Molestar.
     *
     * Desde Android 11 hay un destino que abre LA FICHA DE ESTA APP, con su único interruptor. El
     * otro —el que estaba antes— abre la lista de TODAS las apps del teléfono, donde la persona
     * tiene que encontrarse entre Android Auto, Gmail y Google Play Services. Es el mismo error que
     * ya cometimos con la batería: mandar a alguien a un menú del sistema a buscarse.
     *
     * Se conserva la lista como respaldo para Android 10 y anteriores, y por si algún fabricante no
     * implementa el destino directo.
     */
    @PluginMethod
    public void abrirAjustesNoMolestar(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                // Cadena literal y no constante: Android expone esta pantalla pero NO publica su
                // constante en Settings, así que no se puede referenciar de otra forma. Si algún
                // teléfono no la implementa, el catch cae a la lista de todas las apps.
                Intent i = new Intent("android.settings.NOTIFICATION_POLICY_ACCESS_DETAIL_SETTINGS");
                i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                call.resolve();
                return;
            } catch (Exception e) {
                // Sin destino directo en este teléfono: se cae a la lista.
            }
        }
        try {
            Intent i = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no_se_pudo_abrir", e);
        }
    }

    /**
     * Los ajustes de sonido del sistema. Es el atajo de la decisión D3: en Android el volumen de un
     * aviso no se puede fijar por código, así que en vez de un deslizador que no mueve nada, la app
     * lleva a la persona donde sí puede cambiarlo.
     */
    @PluginMethod
    public void abrirAjustesDeSonido(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_SOUND_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no_se_pudo_abrir", e);
        }
    }
}
