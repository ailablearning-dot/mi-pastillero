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

    /** La ficha de la app en los ajustes: desde ahí, batería a dos toques. */
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

    /** El acceso a la política de notificaciones, que es lo que permite saltarse el No Molestar. */
    @PluginMethod
    public void abrirAjustesNoMolestar(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
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
