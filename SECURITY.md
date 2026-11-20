# Seguridad

## Versiones soportadas

Se da soporte a la última versión publicada en `master`.

## Reportar una vulnerabilidad

No abras un issue público con detalles sensibles. Usa la pestaña **Security** del
repositorio de GitHub para enviar un aviso privado, o contacta con el
mantenedor por los canales privados que indique el repositorio.

Incluye la versión del lanzador, la distribución/GNOME, los pasos para
reproducir y el impacto. No adjuntes tokens, claves de API ni sesiones reales.

## Modelo de seguridad

- El servidor de DeepSeek Harness escucha solo en `127.0.0.1`.
- El token de arranque es por proceso, se mantiene en memoria y se redacta en los
  registros.
- El renderer de Electron está aislado: `contextIsolation`, `sandbox`, sin
  integración de Node.
- El servidor corre con el usuario y el entorno del usuario, igual que
  `npx @deepseek-ai/dsh web`; tiene acceso completo al sistema por diseño. No
  ejecutes la app con configuraciones de DSH que no confíes.
- En distribuciones que bloquean el sandbox de Chromium se reintenta con
  `--no-sandbox`; esto reduce el aislamiento del renderer, no el del servidor.
