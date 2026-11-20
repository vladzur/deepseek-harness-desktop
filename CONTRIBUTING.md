# Contribuir a DeepSeek Harness Desktop

Gracias por tu interés. Este proyecto es un envoltorio de escritorio para DeepSeek
Harness: el objetivo es que la app se comporte exactamente como `npx
@deepseek-ai/dsh web`, pero en una ventana nativa. Los cambios deben mantener esa
promesa.

## Antes de empezar

- Lee el [README](README.md), sobre todo las secciones **Cómo funciona**,
  **Desarrollo** y **Limitaciones**.
- Comprueba que exista un issue relacionado. Si no existe, abre uno para acordar
  el alcance antes de un cambio grande.
- Sé respetuoso y constructivo. No se toleran el acoso ni los ataques personales.

## Requisitos

- Linux (el soporte objetivo es GNOME 40+; el desarrollo se prueba en GNOME 46).
- Node.js 24.9 o superior (el mismo que exige DSH).
- `bash`, `git` y `curl` (este último para la prueba de humo).
- Para probar la ventana: Electron (lo instala `--install`) o un Electron
  existente vía `DSH_DESKTOP_ELECTRON`.

## Puesta en marcha

```sh
git clone git@github.com:vladzur/deepseek-harness-desktop.git
cd deepseek-harness-desktop
npm run build
npm run check
```

No hay dependencias de npm: los scripts usan solo la biblioteca estándar de
Node. `npm install` no es necesario para compilar.

## Dónde tocar

| Área | Archivo |
|---|---|
| Lógica del lanzador bash, instalación, estado y diagnóstico | `src/launcher/dsh-desktop.in` |
| Proceso principal de Electron, ventana, servidor, descargas, permisos | `src/electron/main.js` |
| Pantalla de inicio | `src/electron/splash.html` |
| Manifiesto de la app Electron | `src/electron/package.json` |
| Icono | `assets/icon-192.png` |
| Build | `scripts/build.mjs` |
| Comprobaciones | `scripts/check.mjs` |
| Prueba de humo | `tests/smoke.sh` |

**No edites `dsh-desktop` a mano.** Es el artefacto generado que se instala.
Edita `src/`, ejecuta `npm run build` y commitea también `dsh-desktop`.

## Ciclo de desarrollo

```sh
# compilar el lanzador
npm run build

# comprobaciones estáticas
npm run check

# primera vez: runtime de Electron (o --install --no-runtime + DSH_DESKTOP_ELECTRON)
./dsh-desktop --install

# perfil aislado, con DevTools y logs
export DSH_HOME="$(mktemp -d)"
export DSH_DESKTOP_DEBUG=1
./dsh-desktop

# probar solo el servidor, sin ventana
./dsh-desktop --no-window
```

Para evitar descargar Electron:

```sh
./dsh-desktop --install --no-runtime
DSH_DESKTOP_ELECTRON=/ruta/a/electron ./dsh-desktop
```

Opciones útiles:

- `DSH_DESKTOP_WORKSPACE=/ruta` — workspace inicial.
- `DSH_DESKTOP_SPEC="@deepseek-ai/dsh@<versión>"` — fijar DSH.
- `DSH_DESKTOP_PORT=0` — puerto libre automático.
- `DSH_DESKTOP_OZONE=x11|wayland|auto` — backend gráfico.
- `--debug` — DevTools + logs detallados.

## Versión del payload

`PAYLOAD_VERSION` (en `src/launcher/dsh-desktop.in`) controla si `--install`
vuelve a extraer la ventana Electron. **Increméntalo siempre que cambies
`main.js`, `splash.html`, `package.json` o el icono**, aunque no cambies
`SCRIPT_VERSION`:

```bash
PAYLOAD_VERSION="2"   # → 3, 4, ... al tocar el payload
```

Si no lo haces, las instalaciones existentes seguirán usando el payload viejo.
El build no lo actualiza solo.

## Pruebas

Antes de abrir un pull request:

```sh
npm run build
npm run check
# opcional, requiere npx/red y no toca ~/.dsh:
npm run smoke
```

Pruebas manuales recomendadas para cambios de UI o de ciclo de vida:

1. Abrir desde el menú de GNOME y comprobar que la UI carga.
2. Copiar texto, adjuntar un archivo, arrastrar un archivo y descargar un log.
3. Abrir un enlace externo (debe ir al navegador del sistema).
4. Previsualizar PDF y Office.
5. Cerrar la ventana y verificar que no quedan procesos (`--status`).
6. Abrir dos veces: debe enfocar la misma ventana.
7. `--doctor` sin problemas críticos.
8. Si puedes, probar en X11 y Wayland.

La integración continua ejecuta solo `npm run build`, verifica que
`dsh-desktop` esté actualizado y ejecuta `npm run check`.

## Commits y pull requests

- Ramas desde `master`; el PR va contra `master`.
- Mensajes de commit en formato [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- Un PR = un cambio coherente. Incluye:
  - qué cambia y por qué;
  - cómo lo probaste;
  - capturas si afecta a la UI (sin datos personales);
  - el `dsh-desktop` regenerado.
- Mantén el estilo: UTF-8, LF, 2 espacios, mensajes en español, `set -euo pipefail`
  en bash, sin dependencias nuevas si se evitan.
- No incluyas tokens, credenciales ni rutas personales en los logs o capturas.
  Los logs de DSH pueden contener información sensible aunque el token se
  redacte.

## Reportar bugs

Incluye:

- distribución, versión de GNOME y sesión (X11/Wayland);
- `node -v`, `npx -v`, versión del lanzador y de Electron;
- pasos para reproducir, resultado esperado y real;
- salida de `dsh-desktop --doctor`;
- fragmentos relevantes de `dsh-desktop --logs` **redactados**.

Si es un problema de seguridad, no abras un issue público con datos sensibles:
usa la pestaña **Security** del repositorio.

## Licencia

Al contribuir aceptas que tu aporte se publique bajo la licencia
[MIT](LICENSE) del proyecto.
