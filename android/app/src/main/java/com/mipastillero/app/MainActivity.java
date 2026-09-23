package com.mipastillero.app;

import android.os.Bundle;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // El plugin propio de permisos. Se registra ANTES de super.onCreate: después, el puente ya
        // está construido y no lo ve.
        registerPlugin(PermisosPlugin.class);
        super.onCreate(savedInstanceState);

        // EL MODO OSCURO DE ANDROID.
        //
        // La app entera se pinta con `prefers-color-scheme` y en iOS funciona sola. En Android no:
        // desde targetSdk 33 el WebView le dice al contenido "estoy en claro" por defecto, aunque
        // el teléfono esté en modo noche, y hay que autorizarlo explícitamente. Sin esta línea la
        // app se ve en BLANCO a las once de la noche, en un teléfono con todo lo demás en oscuro —
        // comprobado en el emulador el 2026-09-22.
        //
        // "Algorithmic darkening" suena a que Android va a invertir los colores por su cuenta, y
        // esa es la mitad del nombre que asusta. Solo lo hace con páginas que NO saben pintarse en
        // oscuro; a las que sí —la nuestra lo declara en su <meta name="color-scheme">— les pasa el
        // `prefers-color-scheme: dark` y se aparta.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(
                getBridge().getWebView().getSettings(), true);
        }
    }
}
