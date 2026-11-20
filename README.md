# DeepSeek Harness Desktop

[![CI](https://github.com/vladzur/deepseek-harness-desktop/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/vladzur/deepseek-harness-desktop/actions/workflows/ci.yml)

Lanzador para Linux que abre **DeepSeek Harness** en una ventana de aplicación
nativa, como si fuera un programa más del escritorio. Está pensado para
**GNOME 40 o posterior** y funciona en X11 y Wayland.

No es una reimplementación ni un cliente distinto: por debajo ejecuta **el mismo
servidor que `npx`** y muestra su interfaz real en una ventana de Electron.

```sh
npx @deepseek-ai/dsh web --no-open --host 127.0.0.1 --port 0
```

> Proyecto comunitario independiente. No está afiliado a DeepSeek. DeepSeek
> Harness y su icono pertenecen a sus respectivos autores.

---

## Índice

- [Características](#características)
- [Cómo funciona](#cómo-funciona)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Uso](#uso)
- [Configuración](#configuración)
- [Capacidades y paridad con npx](#capacidades-y-paridad-con-npx)
- [Limitaciones](#limitaciones)
- [Desarrollo](#desarrollo)
  - [Estructura del repositorio](#estructura-del-repositorio)
  - [Compilar](#compilar)
  - [Ejecutar en desarrollo](#ejecutar-en-desarrollo)
  - [Tests](#tests)
  - [Cómo funciona el build](#cómo-funciona-el-build)
  - [Versión del payload](#versión-del-payload)
  - [Estilo de código](#estilo-de-código)
  - [Checklist de release](#checklist-de-release)
- [Contribuir](#contribuir)
- [Solución de problemas](#solución-de-problemas)
- [Desinstalación](#desinstalación)
- [Seguridad](#seguridad)
- [Licencia](#licencia)

---

## Características

- **Ventana de aplicación real**: sin barra de direcciones ni pestañas, con
  icono, título y entrada en el menú de GNOME.
- **El servidor de verdad**: usa `@deepseek-ai/dsh` desde `npx`, el perfil
  `web`, tu `DSH_HOME`, tus plugins, tus sesiones y tus credenciales.
- **Tus capacidades intactas**: bash, filesystem, terminal, trabajos en segundo
  plano, MCP, skills, Office, aprobaciones y permisos funcionan igual que en la
  CLI. El servidor corre con tu usuario y tu entorno; solo el renderer de la
  ventana está aislado.
- **Instancia única**: abrir de nuevo enfoca la ventana existente.
- **Cierre limpio**: al cerrar la ventana se detiene el servidor; no quedan
  procesos huérfanos.
- **Instalación de usuario**: `~/.local`, `~/.config` y `~/.local/share`, sin
  `sudo`.
- **Un único archivo ejecutable** para instalar, generado desde las fuentes de
  este repositorio.
- **Token protegido**: la URL autenticada se captura en memoria y los registros
  la muestran redactada (`token=REDACTED`).
- **Diagnóstico incluido**: `--doctor`, `--status`, `--logs` y modo
  `--no-window` para SSH.

## Cómo funciona

```text
Acceso del menú (.desktop)
        │
        ▼
dsh-desktop (bash)  ── resuelve Node/npx, PATH, workspace y DSH_HOME
        │
        ▼
Electron (ventana)  ── splash, captura la URL autenticada, carga la UI
        │
        ▼
Servidor DSH real (npx … web) ── perfil web, sesiones, herramientas, plugins
```

- El **servidor** corre fuera del sandbox del navegador, con tu usuario, tu
  entorno y tu `PATH`: conserva todas las capacidades de `npx`.
- El **renderer** (la ventana) es un Chromium aislado: `contextIsolation`,
  `sandbox`, sin Node y sin acceso al sistema; solo pinta la interfaz.
- El servidor escucha solo en `127.0.0.1`; el token de arranque es por proceso y
  no se escribe en disco.
- La ventana se abre en una partición persistente de Electron para conservar
  cookies y almacenamiento local de la UI.

## Requisitos

- Linux con GNOME 40+ (probado en Pop!_OS 24.04 / GNOME 46, X11).
- **Node.js 24.9 o superior** con `npx` (por ejemplo instalado con nvm).
- Conexión a Internet la primera vez: Electron ocupa unos 300 MB y, si no está
  en caché, `npx` descarga el paquete de DSH.
- `bash`, `coreutils`, `curl` (este último solo para la prueba de humo).
- `zenity` es opcional (avisos de error cuando se abre desde el menú).

DSH, sus sesiones y sus credenciales viven en `~/.dsh` (o `DSH_HOME`), igual que
con `npx`.

## Instalación

### Desde el repositorio

```sh
git clone git@github.com:vladzur/deepseek-harness-desktop.git
cd deepseek-harness-desktop
./dsh-desktop --install
```

### Solo con el archivo ejecutable

Descarga `dsh-desktop` de este repositorio, dale permiso de ejecución y
instálalo:

```sh
chmod +x dsh-desktop
./dsh-desktop --install
```

`--install` crea:

| Qué | Dónde |
|---|---|
| Lanzador | `~/.local/bin/dsh-desktop` |
| Entrada de GNOME | `~/.local/share/applications/deepseek-harness.desktop` |
| Icono | `~/.local/share/icons/hicolor/192x192/apps/deepseek-harness.png` |
| Carga de la ventana | `~/.local/share/deepseek-harness/app/<versión>/` |
| Runtime Electron | `~/.local/share/deepseek-harness/electron/` |
| Configuración | `~/.config/deepseek-harness/desktop.env` |

Al terminar, **DeepSeek Harness** aparece en el menú de aplicaciones. También
puedes abrirlo con:

```sh
dsh-desktop
```

Opciones útiles de instalación:

```sh
./dsh-desktop --install --no-runtime   # no descarga Electron
DSH_DESKTOP_ELECTRON=/ruta/a/electron dsh-desktop
```

## Uso

| Comando | Qué hace |
|---|---|
| `dsh-desktop` | Abre la aplicación. Si ya está abierta, enfoca la ventana. |
| `dsh-desktop --install` | Instala o actualiza accesos, icono y runtime. |
| `dsh-desktop --install --no-runtime` | Instala sin descargar Electron. |
| `dsh-desktop --status` | Muestra la instancia, el puerto y el workspace. |
| `dsh-desktop --stop` | Cierra la ventana y detiene el servidor. |
| `dsh-desktop --doctor` | Diagnóstico de Node, Electron, display, acceso y puerto. |
| `dsh-desktop --logs [-f]` | Muestra o sigue los registros. |
| `dsh-desktop --no-window` | Servidor en primer plano, como `npx` (útil por SSH). |
| `dsh-desktop --debug` | Logs detallados y DevTools. |
| `dsh-desktop -- --patch ./extra.yml` | Argumentos extra para `dsh web`. |
| `dsh-desktop --uninstall [--purge]` | Desinstala; `--purge` borra también runtime, configuración y logs. Nunca toca `~/.dsh`. |

## Configuración

Edita `~/.config/deepseek-harness/desktop.env` (se carga al iniciar):

| Variable | Por defecto | Descripción |
|---|---|---|
| `DSH_DESKTOP_WORKSPACE` | `$HOME` | Directorio de trabajo inicial (workspace de DSH). |
| `DSH_DESKTOP_SPEC` | `@deepseek-ai/dsh` | Paquete o versión que se lanza con `npx`. |
| `DSH_DESKTOP_PORT` | `0` | Puerto fijo; `0` elige uno libre (recomendado). |
| `DSH_DESKTOP_PATH_PREPEND` | vacío | Rutas extra al principio del `PATH` del servidor. |
| `DSH_DESKTOP_ELECTRON_VERSION` | `45.4.1` | Versión de Electron que instala `--install`. |
| `DSH_DESKTOP_ELECTRON_CACHE` | `~/.cache/electron` | Caché de descarga del binario de Electron. |
| `DSH_DESKTOP_ELECTRON` | vacío | Ruta a un Electron ya instalado. |
| `DSH_DESKTOP_OZONE` | `auto` | `auto`, `x11` o `wayland`. |
| `DSH_DESKTOP_NO_SANDBOX` | `0` | `1` desactiva el sandbox de Chromium. |
| `DSH_DESKTOP_DISABLE_GPU` | `0` | `1` desactiva la GPU (si la ventana sale en blanco). |
| `DSH_DESKTOP_DEBUG` | `0` | `1` activa logs y DevTools. |
| `DSH_DESKTOP_START_TIMEOUT` | `180` | Segundos de espera del servidor. |

También puedes definir `DSH_DESKTOP_NODE`, `DSH_DESKTOP_NPX` y
`DSH_DESKTOP_NPM` para forzar binarios concretos.

El `PATH` de tu terminal no llega a las aplicaciones que abre GNOME. El lanzador
añade automáticamente el Node elegido y los directorios de usuario habituales;
si necesitas herramientas propias (rbenv, guix, etc.), añádelas en
`DSH_DESKTOP_PATH_PREPEND`.

## Capacidades y paridad con npx

- Mismo servidor, mismo perfil `web`, mismo `DSH_HOME`, mismos plugins y
  sesiones.
- Mismas herramientas: bash, filesystem, búsqueda, terminal integrada, trabajos
  en segundo plano, MCP, skills, Office, aprobaciones y permisos.
- Mismo `DSH_WEB_URL` para el agente.
- Portapapeles nativo, subida de archivos con diálogo del sistema, arrastrar y
  soltar, descargas a `~/Descargas` con notificación, enlaces externos en el
  navegador del sistema y visor de PDF de Chromium.
- `--debug` abre DevTools para depurar plugins.
- Zoom, pantalla completa y atajos de edición en el menú (Alt para mostrarlo).

La única diferencia es la ventana: el renderer no tiene Node, pero quien tiene
acceso al sistema es el servidor, exactamente igual que con `npx`.

## Limitaciones

- **Una instancia por usuario**: la segunda apertura enfoca la ventana existente;
  no se crea un segundo servidor.
- **Cerrar la ventana detiene el servidor**. Si usas tareas programadas,
  recordatorios o trabajos en segundo plano, mantén la ventana abierta (es el
  equivalente a cerrar la terminal donde corre `npx`).
- El `DSH_HOME` es compartido con otras ejecuciones de DSH. Si tienes un
  `dsh web` en una terminal, evita abrir **la misma sesión** en ambos hosts a la
  vez: cada sesión tiene un lock de escritura por proceso. `--doctor` avisa si
  el puerto 3080 está ocupado.
- La instalación de plugins desde la interfaz requiere `pnpm` en el `PATH`
  (igual que con `npx`); si no está, DSH reporta `pnpm-missing`.
- En Wayland, si la integración de ventana o el icono no es correcta, prueba
  `DSH_DESKTOP_OZONE=x11`. En X11 funciona directamente.
- En Ubuntu 24.04, si el sandbox de Chromium está bloqueado, el lanzador
  reintenta con `--no-sandbox` y lo deja anotado en el registro. Puedes forzarlo
  con `DSH_DESKTOP_NO_SANDBOX=1`.

---

## Desarrollo

### Estructura del repositorio

```text
.
├── dsh-desktop                 # GENERADO: lanzador de un solo archivo (se commitea)
├── src/
│   ├── launcher/
│   │   └── dsh-desktop.in      # plantilla bash; aquí va la lógica del lanzador
│   └── electron/
│       ├── main.js             # proceso principal de Electron
│       ├── splash.html         # pantalla de inicio
│       └── package.json        # manifiesto de la app Electron
├── assets/
│   └── icon-192.png            # icono oficial usado por el .desktop y la ventana
├── scripts/
│   ├── build.mjs               # embebe src/ + assets/ en ./dsh-desktop
│   └── check.mjs               # comprobaciones estáticas (CI)
├── tests/
│   └── smoke.sh                # prueba de humo opcional con DSH real
├── .github/workflows/ci.yml    # build reproducible + checks
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

**Regla de oro:** no edites `dsh-desktop` a mano. Es un artefacto generado.
Edita `src/`, ejecuta `npm run build` y commitea también el `dsh-desktop`
regenerado.

### Compilar

Requisitos: Node 24.9+ (solo se usan módulos estándar; no hay dependencias).

```sh
git clone git@github.com:vladzur/deepseek-harness-desktop.git
cd deepseek-harness-desktop
npm run build        # genera ./dsh-desktop
npm run check        # bash -n, node --check, JSON, icono, build al día
```

`npm run build` valida la sintaxis bash del resultado con `bash -n` antes de
escribirlo. El build es determinista: mismas fuentes, mismo archivo.

### Ejecutar en desarrollo

La primera vez necesitas preparar el acceso y el runtime (`--install`), o usar
un Electron existente para no descargarlo. Después, con un perfil de DSH aislado
para no mezclar tus sesiones reales:

```sh
./dsh-desktop --install   # o: --install --no-runtime + DSH_DESKTOP_ELECTRON

export DSH_HOME="$(mktemp -d)"
export DSH_DESKTOP_DEBUG=1
./dsh-desktop
```

Para evitar descargar Electron, usa un runtime existente:

```sh
./dsh-desktop --install --no-runtime
DSH_DESKTOP_ELECTRON=/ruta/a/electron ./dsh-desktop
```

También puedes probar solo el servidor, sin ventana:

```sh
./dsh-desktop --no-window
```

Notas de desarrollo:

- `--debug` abre DevTools y escribe logs detallados.
- Los registros están en `~/.local/state/deepseek-harness/`.
- Para usar otro workspace: `DSH_DESKTOP_WORKSPACE=/ruta/al/proyecto`.
- Para apuntar a otra versión de DSH: `DSH_DESKTOP_SPEC="@deepseek-ai/dsh@0.2.2-rc.5"`.
- Para depurar el lanzador: `bash -x ./dsh-desktop --debug`.

### Tests

| Comando | Qué hace | Requiere |
|---|---|---|
| `npm run check` | Build al día, `bash -n`, `node --check`, JSON, icono. | Node |
| `npm run smoke` | Arranca DSH real con `DSH_HOME` temporal y verifica 401 → 303 → 200. | Node, npx, red o caché, curl |
| Manual | Abrir la ventana, copiar, adjuntar archivo, descargar, enlace externo, PDF. | Entorno gráfico |

La prueba de humo **no** toca tu `~/.dsh`: usa un directorio temporal y un puerto
libre. La integración continua ejecuta solo `check` (sin red ni GUI).

Checklist manual antes de una release:

1. `./dsh-desktop --install` y abrir desde el menú de GNOME.
2. Copiar texto, adjuntar un archivo, arrastrar un archivo y descargar un log de
   sesión.
3. Abrir un enlace externo (debe ir al navegador del sistema).
4. Previsualizar un PDF y un documento Office.
5. Cerrar la ventana y comprobar que no quedan procesos:
   `./dsh-desktop --status`.
6. Abrir dos veces seguidas: debe enfocar la misma ventana.
7. `./dsh-desktop --doctor` sin avisos críticos.
8. Probar en X11 y, si es posible, en Wayland.

### Cómo funciona el build

`src/launcher/dsh-desktop.in` es el lanzador completo con cuatro marcadores:

| Marcador | Se reemplaza por |
|---|---|
| `@@DSH_MAIN_JS@@` | `src/electron/main.js` |
| `@@DSH_SPLASH_HTML@@` | `src/electron/splash.html` |
| `@@DSH_PACKAGE_JSON@@` | `src/electron/package.json` |
| `@@ICON_BASE64@@` | `assets/icon-192.png` en base64 |

El resultado es un único archivo ejecutable que, al instalarse, extrae esos
contenidos a `~/.local/share/deepseek-harness/app/<versión>/` y el icono a
`~/.local/share`. Así el usuario solo necesita `dsh-desktop` para instalar.

### Versión del payload

`PAYLOAD_VERSION` en `src/launcher/dsh-desktop.in` decide si `--install`
vuelve a extraer el payload. **Debes incrementarlo cada vez que cambies
`main.js`, `splash.html`, `package.json` o el icono**, aunque no cambies la
versión del lanzador:

```bash
PAYLOAD_VERSION="2"   # súbelo a 3, 4, ... al tocar el payload
```

Si no lo haces, una instalación existente conservará el payload antiguo. El
build no lo modifica automáticamente.

### Estilo de código

- UTF-8, finales de línea LF, indentación de 2 espacios.
- Bash: `set -euo pipefail`, funciones pequeñas, comillas en expansiones,
  mensajes en español.
- JavaScript: CommonJS en `main.js` (Electron), ESM en `scripts/`.
- Sin dependencias nuevas si se pueden evitar con la biblioteca estándar.
- Mantén el contrato de un solo archivo instalable y la compatibilidad con
  GNOME 40+/Node 24.9+.
- No edites `dsh-desktop` generado; edita `src/`.

### Checklist de release

1. Cambia `SCRIPT_VERSION` en `src/launcher/dsh-desktop.in` (semver).
2. Si tocaste el payload, incrementa `PAYLOAD_VERSION`.
3. `npm run check && npm run smoke`.
4. `npm run build` y commitea `dsh-desktop`.
5. `git tag vX.Y.Z && git push --tags`.
6. Verifica que el badge de CI esté en verde.

## Contribuir

Las contribuciones son bienvenidas. Lee [`CONTRIBUTING.md`](CONTRIBUTING.md)
para el flujo completo. En resumen:

1. Haz un fork y crea una rama desde `master`.
2. Edita `src/` (nunca el `dsh-desktop` generado).
3. Ejecuta `npm run build`, `npm run check` y, si puedes, `npm run smoke`.
4. Commitea también el `dsh-desktop` regenerado.
5. Abre un pull request contra `master` describiendo el cambio y las pruebas.

Usa mensajes de commit tipo [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `chore:`). Para bugs, adjunta la salida de
`dsh-desktop --doctor` y los registros relevantes **sin tokens ni credenciales**.

## Solución de problemas

**«Electron no está instalado»** — ejecuta `dsh-desktop --install`. Si falla la
descarga, revisa la red/proxy o define `ELECTRON_MIRROR`; también puedes fijar
otra versión con `DSH_DESKTOP_ELECTRON_VERSION`, cambiar
`DSH_DESKTOP_ELECTRON_CACHE` o apuntar a un Electron propio con
`DSH_DESKTOP_ELECTRON`.

**La instalación de Electron falla al descargar el binario** — el paquete de
Electron descarga su binario aparte (`install.js`). Revisa la red/proxy o usa
`ELECTRON_MIRROR`.

**No se encuentra Node** — instala Node 24.9+ (`nvm install 24`) o define
`DSH_DESKTOP_NODE=/ruta/a/node`. Comprueba con `dsh-desktop --doctor`.

**El servidor no arranca** — mira `dsh-desktop --logs`. Si `npx` no tiene el
paquete en caché y no hay red, ejecuta una vez `npx @deepseek-ai/dsh web` en una
terminal para poblarla.

**La ventana sale en blanco** — prueba `DSH_DESKTOP_DISABLE_GPU=1` o
`DSH_DESKTOP_OZONE=x11`; revisa `electron.log`.

**El icono o la ventana no se asocian en Wayland** — usa
`DSH_DESKTOP_OZONE=x11`.

**Dos hosts DSH con el mismo `DSH_HOME`** — evita abrir la misma sesión en ambos;
cierra el `dsh web` de la terminal o usa sesiones distintas.

## Desinstalación

```sh
dsh-desktop --uninstall            # accesos, icono y payload
dsh-desktop --uninstall --purge    # además runtime, configuración y logs
```

Las sesiones y credenciales de `~/.dsh` se conservan siempre.

## Seguridad

- El servidor escucha solo en `127.0.0.1`.
- El token de arranque se mantiene en memoria y se redacta en los logs.
- El renderer está aislado (`contextIsolation`, `sandbox`, sin Node); no
  ejecutes la app con URLs de terceros.
- El servidor sí tiene acceso completo al sistema, por diseño: es el mismo
  proceso que `npx`. Trata la app como tratarías una terminal de DSH.
- Si encuentras un problema de seguridad, no lo publiques con datos sensibles;
  abre un aviso privado o un issue sin tokens.

## Licencia

[MIT](LICENSE). DeepSeek Harness, su nombre y su icono pertenecen a sus autores;
este proyecto es un envoltorio comunitario no oficial.
