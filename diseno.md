# EFF-EX — Diseño

Pensado para usarse en el andén desde un celular: botones grandes, una acción por pantalla y alertas imposibles de ignorar.

## Paleta
| Token | Hex | Uso |
|---|---|---|
| `navy` | `#1E3A8A` | Títulos, encabezados de tabla y pestaña activa |
| `accent` | `#7C3AED` | Acciones principales (escanear, imprimir) y marca |
| Verde | `#059669` | Verificado, disponible, siguiente paso |
| Ámbar | `#D97706` | Pendiente, en ruta, instrucciones |
| Rojo | `#DC2626` | Bloqueo, error de escaneo, duplicado |

El color de **estado** (verde/ámbar/rojo) solo se usa para estados; la marca usa morado y azul. Siempre va junto a un texto o ícono (VERIFICADO, BLOQUEO).

## Tipografía
**Inter** para la interfaz y **JetBrains Mono** para folios, SKU, códigos y cifras (`OC-501`, `P-501-01`, `$450.00`).

## Poka-Yoke (a prueba de errores)
- Un error de escaneo muestra una alerta roja con vibración visual y suena un tono grave; un acierto, verde y tono agudo.
- Todo bloqueo se suma al contador y queda en la bitácora.
- Con los 3 operadores en ruta se bloquean los escaneos de salida.
- Los SKU se generan solos y la cantidad es fija (1 tarima) para evitar captura manual.

## Modo claro / oscuro
Botón en el encabezado; el modo oscuro conserva los colores de estado.
