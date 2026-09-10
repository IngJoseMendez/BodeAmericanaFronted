# Matriz en dos fases — especificación de diseño

> Estado: diseño cerrado, pendiente de implementar.
> Prototipo navegable: https://claude.ai/code/artifact/9d7541c4-9a82-4489-9d36-326df0ddd3b7
> Pantalla afectada: `client/src/pages/SeparacionMasiva.jsx` (sidebar «Matriz», ruta `/separacion-masiva`).

## Decisiones confirmadas por la dueña

| Pregunta | Respuesta |
|---|---|
| ¿Trabaja sola en la Matriz? | **Sí, sola.** El control de stock del navegador basta; el 400 del servidor es la última red. No hace falta reserva blanda ni bloqueo de tanda. |
| ¿A qué precio se salda un faltante? | **Al precio de hoy**, con un botón de un clic para respetar el viejo cuando hoy esté más caro. `precio_unitario_origen` no se actualiza nunca. |
| ¿Todo lo que no alcanza queda como faltante? | **Sí, todo**, con una casilla escondida por línea para descartar un caso suelto. |
| ¿La palabra es «faltante»? | **Sí.** Misma palabra en pantalla, en el código y en la base de datos. |

## Concepto


La Fase 2 es la MISMA tabla densa de la Fase 1 con el agrupador girado: un tbody por producto, dentro una fila por cada cliente que lo pidió, y una sola columna editable ("Le doy"). Nada se pliega: los 3 productos que no alcanzan van arriba, abiertos, ordenados por faltante descendente, y los 15 que alcanzan van debajo repartidos solos, cada uno en UNA línea con su cuenta a la vista y un chevron para abrirlos. Encima de todo, pegada, va la cinta de clientes: una tarjeta por cliente con "11/18 · falta 7 · $17.935.000", que es literalmente la fila 2 de su Excel y es la única forma de que vea a MARIA completa mientras reparte producto por producto — sin eso le manda a alguien una cotización de dos pacas con flete de dos pacas y se entera cuando el cliente reclama. La palabra es FALTANTE en toda la interfaz, en el código y en la base de datos; el verbo es REPARTIR. Y la regla que sostiene el módulo entero: el faltante SOLO nace cuando se reparte, se consolida en UNA fila abierta por cliente+referencia+calidad, se abona con un clic desde el chip de la Fase 1, y nunca caduca por reloj — envejece a la vista.

## Vocabulario

FALTANTE (sustantivo). Chip conversacional: «Le faltaron 3». Verbo: REPARTIR / REPARTIDO. Evento: REPARTO. Estados en BD: 'abierto' | 'completado' | 'anulado'. PROHIBIDAS en todo el módulo: «pendiente» (ya significa tres cosas: pedido del portal, cotización, despacho por confirmar), «saldo» y «deuda» (son PLATA: Cartera, Deuda masiva, y su propio SALDO PENDIENTE), «por entregar» (choca con «vendido sin despachar», que sí existe y sí se puede cargar hoy, y además promete una entrega de mercancía que todavía hay que importar), «backorder» (anglicismo). Tres razones para faltante: (1) el backend ya la usa para exactamente esto en cotizaciones.js:43 y :222 («se devuelven TODOS los faltantes juntos») — no inventamos vocabulario, lo sacamos a la superficie; (2) ella ya la usa en el espejo: su hoja de reclamación dice «Faltante por cobrar al proveedor», así que el modelo mental ya existe y la dirección la da la preposición; (3) afirma un hecho («le faltó») en vez de prometer una entrega. REGLA ANTIAMBIGÜEDAD: el faltante SOLO existe después de repartir. En la Fase 1 a nadie le falta nada, solo hay menos mercancía que demanda, y eso se dice «hay 10 · piden 20» — el chip que hoy dice «Faltan 5» (SeparacionMasiva.jsx:332) tiene que cambiar o la palabra significaría dos cosas en la misma pantalla. Y lo que sobra del stock sin repartir se llama SIEMPRE «sin repartir», JAMÁS «faltante».

## Fase 1 — Pedidos

LO QUE NO SE TOCA, Y ES DELIBERADO. La tabla sigue siendo la de hoy: un <tbody> por cliente, TODOS los clientes activos a la vista, un cliente sin ítems ocupa UNA fila, 7 columnas (Cliente w-[20%] min-w-[170px] · Referencia min-w-[210px] · Calidad min-w-[130px] · Cant. w-[70px] · Precio w-[120px] · Subtotal w-[130px] · w-[44px] de quitar), el <td rowSpan={items.length + 1}> con la info del cliente, «+ Ítem» como único camino para estrenar a alguien, la barra pegajosa top-[64px], FilaCliente en React.memo (línea 131), los manejadores en useCallback sin dependencias, tablasRef/stockRef/calidadesRef/clientesRef en useRef. Toda la maquinaria de rendimiento está calibrada dentro de ese componente y es la única defensa contra repintar cientos de filas por tecla. Se mueve tal cual a client/src/pages/matriz/FasePedidos.jsx y no se «aprovecha para limpiar» nada.

CAMBIO 1 — PEDIR DE MÁS DEJA DE SER UN ERROR. Es el cambio semántico que sostiene el encargo, y hay que hacerlo en SEIS sitios, no en dos. Los enumero porque el jurado cazó que las propuestas nombraban tres y dejaban el resto gritando en rojo:
· ~986 `impedimento` pierde entera la rama «No alcanzan las pacas de REF / CAL: hay X y se piden Y». Quedan solo dos motivos: «Todavía se están cargando los datos.» y «Todavía no hay ningún cliente con ítems completos.»
· ~169 el sufijo `{hayConflicto && <span className="font-semibold text-error"> · sin stock</span>}` bajo el nombre del cliente SE BORRA. Ya no es un defecto.
· ~221 el fondo del tbody pasa de `hayProblema || hayConflicto ? 'bg-error/[0.04]'` a solo `hayProblema`. El rojo vuelve a significar una única cosa: el servidor rechazó a este cliente.
· ~280 el `<tr className={excede ? 'bg-error/10' : ''}>` del ítem se cae. Sin fondo.
· ~297 y ~369 `campo(excede, ...)` en los <select> de Referencia y Calidad pasa a `campo(false, ...)`. `mal` vuelve a significar «el dato está incompleto», no «sobra».
· ~332 el chip semáforo cambia de color y de palabra SIN moverse de sitio ni de tamaño: `bg-error/15 text-error` «Faltan 10» pasa a `bg-warning/15 text-warning` «hay 10 · piden 20». Los otros dos tramos se conservan: margen ≤ 2 → ámbar «quedan 2»; resto → verde «quedan 16».
· El banner rojo agregado se vuelve franja ámbar: `rounded-xl border border-warning/40 bg-warning/10 text-xs text-warning` con <AlertTriangle size={14}/> y role="status": «3 productos no alcanzan para todo lo pedido. No es un error: los repartes en el paso 2.» y debajo, en text-[11px], las tres primeras separadas por «·» más «+N más». Ordenadas por faltante descendente, o sea el array `conflictos` que ya existe y NO se borra: es el insumo de la Fase 2.

CAMBIO 2 — EL SELECTOR DE REFERENCIA SE ABRE A LO QUE NO TIENE EXISTENCIAS. Sin esto media especificación no funciona: el caso que motiva todo el encargo es «el cliente pide lo que se voló», y hoy el <select> solo ofrece lo que tiene stock, así que ese pedido no se puede ni capturar. Dos <optgroup>:
  <optgroup label="Con existencias">  MIXTA INVIERNO — 10 disp …
  <optgroup label="Sin existencias">  SHORTS — 0 disp …
El segundo grupo se arma con `tablasRef.current.referencias` (el catálogo, que ya está cargado) menos las que tienen stock, más cualquier referencia que aparezca en un faltante abierto, ordenado alfabéticamente. El precio se resuelve con la cascada de siempre (promoción → listaPrecios → preestablecido), que NO depende del stock; si no resuelve queda vacío con el chip «Sin precio — escríbelo» que ya existe. La línea lleva chip `text-[10px] bg-warning/15 text-warning` «sin existencias». La salvaguarda `refSinStock` (~268) que hoy reinyecta la opción para no borrar el dato al repintar se conserva y deja de ser un caso raro.

CAMBIO 3 — EL FALTANTE, EN LA LÍNEA DE LA CIUDAD. Cero filas nuevas. Dentro del bloque `infoCliente`, en el mismo <p className="text-[11px] text-muted truncate leading-tight"> donde ya va la ciudad, y con la misma gramática de fragmentos que el código ya usa ahí:

  {cliente.ciudad || 'Sin ciudad'}
  {faltante && (<>{' · '}
    <button type="button" onClick={() => onCargarFaltante(cliente.id)} title={faltante.detalle}
      className="inline-flex items-center gap-1 align-middle font-semibold text-warning hover:underline underline-offset-2">
      <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />
      {faltante.corto}
    </button></>)}
  {hayProblema && <span className="font-semibold text-error"> · no se creó</span>}

Cuatro cosas deliberadas: `align-middle` en el inline-flex (sin eso la caja del punto empuja la altura de línea y se pierden los píxeles que se estaban protegiendo); el punto de 6px es lo que hace que se note al barrer 200 filas sin leer ninguna; va ANTES de «no se creó» porque el párrafo tiene truncate y el faltante es lo único sin otro refuerzo en la fila; y ES UN BOTÓN, porque pulsarlo es cómo se salda. Sin faltante NO se pinta nada — nada de un «0» que ocupe altura.
Texto: un producto → «Le faltaron 3». Varios → «Le faltaron 7 (3 refs)». Con 3 o más repartos de espera, un <AlertTriangle size={11}/> delante del punto — la escalada tiene que caber en el mismo espacio o crece la fila.
Title (máximo 6 líneas de detalle, luego «…y N más. Míralo completo en Faltantes.»): «Le quedaron faltando a MARIA: 3 de MIXTA INVIERNO / premium — desde el 12/08/2026, 3 repartos de espera; 4 de SHORTS / supreme — desde el 03/09/2026. Son 7 pacas. Pulsa para agregarlas al pedido.»

CAMBIO 4 — EL BOTÓN QUE CARGA EL FALTANTE, en dos escalas.
· Por cliente, pegado a «+ Ítem» (donde ya está su mano), con el estilo de `botonAgregar` en ámbar: «+ Lo que le faltó (7)». Sin confirmación: mueve tres números y se deshace con la × de siempre.
· Global, en la barra pegajosa: «↺ Cargar todo lo que faltó (14)», Button variant="ghost" size="sm". Este SÍ pasa por confirm variant 'success' con la cuenta exacta, porque toca muchos clientes de golpe.
Comportamiento por línea: se cruza con `claveStock(ref, cal) = normTxt(ref)+'|'+normTxt(cal)` — la MISMA clave que usan pedidoPorClave y reservarPacas. Si el cliente ya tiene esa referencia+calidad se SUMA a la línea existente y se anota `cargado += n`; si no, se crea al final. Nunca dos líneas del mismo producto para el mismo cliente: en la Fase 2 producirían dos celdas y ella tendría que fusionarlas a mano.
Precio: se resuelve con la cascada de HOY. Si difiere del guardado, la línea lleva chip `Precio cambió` con title «Se lo debíamos a $1.700.000 y hoy vale $1.900.000. Está puesto el de hoy; pulsa para respetarle el anterior.» — y solo cuando hoy está MÁS CARO ese chip es pulsable.
Idempotencia: carga solo lo que falta por cargar. Sin nada cargado → «+ Lo que le faltó (7)». Cargado a medias porque ella bajó la cantidad → «+ Lo que le faltó (2 restantes)». Todo cargado → botón visible pero disabled con texto «Ya está cargado». Este proyecto ya duplicó abonos por un doble clic.
La línea cargada lleva chip `text-[10px] bg-warning/15 text-warning` «3 de antes».
Si ella cambia la referencia o la calidad de una línea cargada, `cargado` se BORRA: si no, saldaría un faltante de jeans entregando chaquetas.

CAMBIO 5 — CONTADOR-FILTRO EN LA BARRA. Al lado del checkbox «Ver sólo los que tienen ítems», un <button aria-pressed> ámbar: «Le faltó a 5 clientes». Pulsado, filtra la tabla a esos clientes. Cero peticiones (es un filtro sobre un Map ya cargado) y resuelve el arranque real de una ronda, que es «primero miro a quién arrastro». Respeta la regla de `clientesVisibles`: un cliente con fila o con problema del servidor SIEMPRE se muestra, aunque el filtro esté puesto. Si no se le debe a nadie, el chip NO se renderiza.

REGLA DE RENDIMIENTO, INNEGOCIABLE. Los faltantes llegan de UNA sola llamada agregada (`matrizApi.getFaltantes()`) como sexta promesa del Promise.allSettled que ya existe (~632-687), JAMÁS una por cliente: la Matriz pinta cientos de tbody. Se guardan en `faltantesRef.current = Map<clienteId, {corto, detalle, unidades, lineas}>`, en useRef y NO en estado, y se pasan como `faltante={faltantesRef.current.get(cliente.id)}` — el MISMO objeto durante toda la vida de la pantalla salvo que se recalcule, y al recalcular solo los clientes tocados reciben objeto nuevo. Dentro de ese objeto NADA de Date, ids aleatorios ni «hace N días» calculado en render: `corto` y `detalle` se precalculan al cargar, ya como strings. Es la misma trampa silenciosa que cacheAvisos tiene con JSON.stringify: una firma que nunca coincide pierde la memoización sin que nada falle. Y `onCargarFaltante` es un useCallback SIN dependencias que lee de `faltantesRef.current`, no del estado — la prop de datos y el manejador rompen el memo por igual.

REGLA DE ERROR, INNEGOCIABLE. Si GET /matriz/faltantes falla NO se pinta «Le faltaron 0» en nadie ni se pinta el contador: no se pinta nada, y `avisoCarga` gana la línea «No pude leer lo que quedó faltando de repartos anteriores. Que no aparezca el aviso NO significa que no le debas nada a nadie.» Es la regla de oro que ya cumplen CarteraCliente.jsx y ClienteDashboard.jsx.

PIE PEGAJOSO. Igual que hoy: «8 cliente(s) · 97 paca(s) pedidas · $163.415.000» y, si las hay, «2 línea(s) sin terminar no pasan al reparto». Debajo, en text-[11px] text-muted, una frase nueva y necesaria: «Este total es lo PEDIDO. El de las cotizaciones sale en el paso 2, con lo que de verdad repartas.» A la derecha, el botón «Repartir lo que hay» con <ArrowRight size={16}/>.

## El paso entre fases

DÓNDE VIVE. En el pie pegajoso (sticky bottom-4 z-10 → Card border-secondary/40 shadow-lg), exactamente en el hueco donde hoy está «Crear N cotización(es)». Mismo Button, mismo sitio, misma línea de motivo debajo.

TEXTO. «Repartir lo que hay» con <ArrowRight size={16}/>. Mientras trabaja: «Revisando el inventario…» con loading. Se descarta «Pedidos terminados» —que es lo que ella dijo— por cuatro razones concretas: todos los botones de esta app son acciones en imperativo («Crear 12 cotización(es)», «Descargar matriz en Excel») y «Pedidos terminados» es un estado; «terminados» se lee como «ya se entregaron», que es lo contrario de lo que pasa; no dice a dónde lleva, y en un flujo de dos fases un botón mudo da miedo de oprimir; y deja claro que ahí todavía no se vende nada. Si al enseñárselo prefiere su frase, se cambia una constante.

QUÉ BLOQUEA. Solo dos cosas, las mismas de hoy: «Todavía se están cargando los datos.» y «Todavía no hay ningún cliente con ítems completos.» NO valida stock. Ese es el punto entero del rediseño.

QUÉ NO BLOQUEA PERO SÍ AVISA. Las líneas a medias, y SOLO si las hay. useConfirm variant 'info': título «Hay 2 línea(s) sin terminar», cuerpo «Les falta la calidad o el precio, así que no pasan al reparto: MARIA (1) y PEDRO (1).» — con los NOMBRES, porque un número sin nombre no es accionable y esa línea puede hacer desaparecer un producto entero del reparto. confirmText «Seguir al reparto», cancelText «Volver a revisar». Si no hay líneas a medias NO hay diálogo: una confirmación gratuita entrena a darle «Sí» sin leer, y el confirm que de verdad importa es el de crear las cotizaciones.

QUÉ HACE AL CRUZAR, en este orden.
1. RELEE EL STOCK. `await cargarStock()` con el botón en loading. Es obligatorio y no es opcional: todo el control de stock de esta pantalla es de cliente sobre UNA lectura, y el flujo de dos fases alarga la ventana entre leer y consumir de minutos a media hora larga. Repartir a dedo diez pacas que otra usuaria ya apartó es la peor manera posible de fallar.
2. SI LA RELECTURA FALLA, SE CRUZA IGUAL. Franja ámbar permanente sobre la tabla de la Fase 2: «No pude confirmar el inventario. Lo que ves es la lectura de las 10:42. Si otra persona apartó pacas, al crear las cotizaciones puede faltar.» + botón «Reintentar». Bloquearla ahí la dejaría con la matriz entera tecleada y sin salida.
3. SI LA RELECTURA CAMBIÓ ALGO. Franja ámbar «El inventario cambió mientras capturabas: 2 productos tienen menos que hace un rato.» y esos productos suben al principio del orden con chip `cambió`. Y el sello de hora de la lectura queda SIEMPRE visible en la barra («Inventario leído a las 10:42 · Volver a leer»), no solo cuando falla: en el caso normal, que es el peligroso, ella no tiene otra forma de saber si su verdad es de hace un minuto o de hace una hora.
4. PRECARGA EL REPARTO. Todo producto con pedido ≤ disponible queda asignado AL 100% y nace «listo», en verde. Los que no alcanzan nacen EN CERO, sin sugerencia. Ella dijo que reparte a dedo justamente cuando no alcanza; devolverle también lo que sí alcanza es trabajo inventado, y precargarle un número en lo escaso la obliga a leer y desmentir cifras que no puso.

CÓMO SE VUELVE. Botón «Volver a los pedidos» (variant ghost, icon ArrowLeft) arriba a la izquierda de la barra de la Fase 2. Sin confirmación: volver no destruye nada y pedirle permiso cada vez la enseñaría a no leer. No es «Atrás»: tiene que prometer que lo capturado sigue ahí.

QUÉ SOBREVIVE AL IDA Y VUELTA. Todo. `filas` y `reparto` son dos estados independientes que viven en el orquestador; conmutar `fase` no limpia ninguno. El bloque de tabla de la Fase 1 se oculta con `hidden`, NO se desmonta: desmontar y remontar cientos de <tbody> con sus <select> es un congelón perceptible en cada ida y vuelta, y el diseño presume de que volver es gratis. Además se recuerda el scroll y se resalta 2 segundos el cliente del que venía.

QUÉ PASA AL REENTRAR. `reconciliarReparto(reparto, pedidoPorClave, stockPorClave)`, función pura en client/src/lib/matriz.js, con cuatro reglas en orden y ninguna en silencio:
· Producto+cliente que no cambió → su asignación se conserva EXACTA. Es el caso normal y no debe costar nada.
· El cliente bajó su pedido por debajo de lo asignado → se recorta al pedido nuevo.
· El cliente borró la línea, o el producto ya no lo pide nadie → su asignación se descarta.
· El disponible bajó por debajo de lo ya repartido → se recorta A PRORRATA (no «de abajo arriba», que son dos algoritmos distintos y quien lo implemente elegiría uno al azar), y si aun así se pasa, el producto queda con «Te pasaste por 2» y no deja confirmar hasta que ella lo arregle.
Si el disponible SUBIÓ (llegó un contenedor, se rechazó una cotización y liberarPacas devolvió pacas), el producto que estaba corto y ahora alcanza vuelve a dispararse el autorreparto y se marca «cambió». Todos los productos tocados suben al principio, pierden el «listo» y la barra saca el chip pulsable «2 producto(s) para revisar» que salta al primero, más la franja role="status": «Reajusté el reparto de 2 productos porque cambiaron los pedidos.»

IRREVERSIBILIDAD. «Repartir lo que hay» es reversible las veces que quiera. El punto de no retorno es «Crear 8 cotización(es)»: ahí se apartan pacas, se crean documentos y se escribe el libro de faltantes. Por eso ese es el único con confirmación de peso.

## Fase 2 — Reparto

ESTRUCTURA. La MISMA receta de tabla densa de la Fase 1, copiada entera: <div className="overflow-x-auto max-h-[calc(100vh-330px)] rounded-2xl border border-border/60 bg-surface"><table className="w-full min-w-[980px] text-sm"><caption className="sr-only">Reparto por producto: dentro de cada producto, una fila por cada cliente que lo pidió y la cantidad que se le entrega.</caption><thead className="sticky top-0 z-[1]"> con «sticky top-0 bg-surface» repetido en CADA <th> y la raya como const RAYA_CABECERA = { boxShadow: 'inset 0 -1px 0 var(--color-border)' } a nivel de módulo. UN <tbody> POR PRODUCTO, el mismo truco de los clientes: fila de cabecera del producto + una fila por cliente + fila de suma.

LAS 8 COLUMNAS, con la correspondencia uno a uno con la Fase 1 escrita al lado (es la mitad del aprendizaje gratis):
 #1 Cliente(rowSpan) → PRODUCTO (rowSpan={clientes.length + 1})  w-[22%] min-w-[200px] px-3 py-2, izquierda
 #2 Referencia       → CLIENTE                                    min-w-[170px] px-2, izquierda
 #3 Calidad          → PIDIÓ                                      w-[64px] px-1 derecha tabular-nums
 #4 —                → LE FALTABA                                 w-[88px] px-1 derecha
 #5 Cant.            → LE DOY                                     w-[108px] px-1, EDITABLE
 #6 Precio           → QUEDA FALTANDO                             w-[96px] px-2 derecha tabular-nums
 #7 Subtotal         → PRECIO                                     w-[110px] px-2 derecha tabular-nums text-muted
 #8 (quitar)         → VALOR                                      w-[124px] px-2 derecha tabular-nums
Cabeceras escritas en frase («Producto», «Le faltaba», «Queda faltando»); la clase `uppercase` las pinta en caja alta, que es lo que hace hoy la tabla y además evita que un lector de pantalla deletree.

LA CELDA #1, EL PRODUCTO. Referencia en font-medium text-primary truncate + calidad en text-[11px] text-muted, y debajo:
· chip de escasez: bg-warning/15 text-warning con <Scale size={9}/> «hay 10 · piden 20 · faltan 10» si no alcanza; bg-success/15 text-success con <Package size={9}/> «alcanza para todos» si sí; bg-error/15 text-error «no queda ninguna» si el disponible es 0.
· contador vivo en text-[11px] tabular-nums: «repartes 10 · libre 0». `libre 0` en text-success cuando está todo repartido. `libre 6` en text-warning SOLO si alguien de ese producto sigue faltando; `libre 20` en text-muted si sobra porque nadie más lo pidió. Esa distinción es lo que impide que una ronda de 18 productos dispare quince avisos falsos.
· «Repartir:» + tres botones de texto text-[11px] font-semibold px-2 h-8 rounded-lg border border-border hover:bg-primary/5, dentro de un contenedor con py-1 para llegar a los 44px de zona táctil: «A prorrata» · «Por orden» · «Cubrir lo que faltó». Y un botón-icono w-9 h-9 con <RotateCcw size={14}/>, aria-label «Vaciar el reparto de este producto».
  Tres criterios y no cuatro a propósito: «a partes iguales» con 3 pacas entre 12 clientes da base = floor(3/12) = 0 y colapsa exactamente en «Por orden», o sea dos botones distintos haciendo lo mismo sin explicación. «Cubrir lo que faltó» solo se pinta si algún cliente de ESE producto trae faltante: es la razón de ser del módulo entero y no debe molestar el 90% del tiempo.
· «Listo» con <Check size={14}/>, aria-pressed, text-[11px] font-semibold px-2 h-8 rounded-lg bg-secondary text-on-primary. Apagado mientras el grupo se pase del disponible.

LA FILA DE CLIENTE.
· CLIENTE: nombre truncate + ciudad text-[11px] text-muted. Si pidió el mismo producto en dos líneas al MISMO precio se funden y aparece «· 2 líneas» con title; si los precios difieren NO se funden, van dos filas sangradas y la segunda lleva chip «promo» — promediar un precio que ella escribió distinto le mueve el descuento sin que nada falle.
· PIDIÓ: número plano.
· LE FALTABA: chip ámbar con punto y la cifra, y DEBAJO, visible y no en un title, «desde 12/08 · 3 repartos». La antigüedad escondida en un tooltip no existe en tableta y es justo el dato que decide a quién darle. Sin faltante: «—» en text-muted. Si la consulta de faltantes falló: «—» con title «No pude leer los faltantes» y la franja de aviso arriba, nunca un 0.
· LE DOY: <input type="text" inputMode="numeric"> con className={campo(mal, 'w-[56px] h-9 px-1 text-right tabular-nums')}, label sr-only con htmlFor derivado de useId, aria-label «Le doy a MARIA de MIXTA INVIERNO premium; pidió 8, hay 10 disponibles». Al enfocar hace select() del contenido: con precarga, todas las celdas llegan con número puesto y sin eso ella estaría borrando con retroceso cuarenta veces. A la derecha, en text-[10px] text-muted tabular-nums, el sufijo «/8». Se lee «[ 5]/8» = le doy 5 de las 8 que pidió. Al lado, botón de texto text-[10px] font-semibold text-secondary «Todo» → min(lo que pidió, lo que queda libre); si ya está en ese tope, disabled opacity-40.
  type=text y no type=number a propósito: en number la rueda del ratón cambia el valor al hacer scroll, y aquí se scrollea todo el rato.
· QUEDA FALTANDO: pedido − asignado. En 0 → «—» en text-muted (nunca un 0 grande repetido doce veces). Mayor que 0 → chip bg-warning/15 text-warning con la cifra. NUNCA en rojo: quedar faltando no es un fallo, es el hecho que se está registrando.
· PRECIO: no editable. La plata se resolvió en la Fase 1; aquí se reparte mercancía. Si la línea vino de un faltante y hoy está más caro, chip pulsable «Respetar 1.700.000» con «hoy 1.900.000, +200.000» en text-[10px]. Solo aparece en esa dirección: ofrecerlo al revés sería ofrecer cobrar de más.
· VALOR: asignado × precioConDescuento, formatCOP.

LA FILA DE SUMA. border-t border-border/70 text-[11px] text-muted: «Suma del producto» · total pedido · total faltaba · «10/10» (asignado sobre disponible, ámbar si asignado < disponible y hay alguien faltando, error si se pasó) · total queda faltando · valor del grupo. Es la aritmética que hoy hace a ojo.

LOS QUE ALCANZAN NO SE PLIEGAN: SE RESUMEN. Cada uno es UNA fila a lo ancho, bg-success/[0.05], con <Check size={13} className="text-success"/>: «JEANS CLÁSICO · primera — 22 pacas a 4 clientes · nadie queda faltando» y un chevron que abre sus filas de cliente. Su ganadora los metía a los 77 dentro de una sola franja; le quito el plegado porque ella dijo literalmente «tiene que ser todo accesible a la vista enseguida sin tener que desplegar nada», y porque retenerle 3 pacas a propósito de algo que sí alcanza es una decisión de negocio que no puede exigir desplegar una franja y buscar. Si toca cualquier cifra dentro, ese producto sale del bloque verde y sube arriba como decisión pendiente.

LA CINTA DE CLIENTES — es la fila 2 de su Excel y es el injerto más importante. Pegada con la barra, con scroll horizontal, una tarjeta por cliente de ~136px, role="status":
  MARIA · 11/18 · ●7 · $17.935.000
Dos líneas: arriba nombre + «repartido/pedido», abajo el valor. El «●7» es el punto ámbar con lo que le queda faltando. La tarjeta se pinta con opacity-60 y chip «sin nada» si el cliente queda en cero. Y lleva un aviso propio que ninguna propuesta tenía: si el cliente termina con 3 pacas o menos y hay transporte por paca, chip ámbar «⚠ 2 pacas» con title «Con 2 pacas el flete son $70.000 sobre $3.400.000. Revisa si vale la pena despacharle.» — porque el flete es POR PACA y el descuento también, así que recortarle a alguien le cambia el total por tres lados y hoy eso no se ve hasta que ya es tarde.
Pulsar una tarjeta RESALTA (no esconde) las filas de ese cliente en toda la tabla, con bg-secondary/10, y pone el foco en la primera. Nunca esconde trabajo.

EL DINERO — LA REGLA QUE EVITA EL BUG QUE ESTE REPO YA TUVO. No se escribe una segunda aritmética. Se construye una PROYECCIÓN de `filas` donde cada ítem lleva cantidad = asignada y se cae si es 0, y se pasa por la `totalesFila` de client/src/lib/cotizacion.js de siempre. Quince líneas en `client/src/lib/matriz.js` (`proyectarFilas(filas, reparto)`) en lugar de replicar tres reglas sutiles: el descuento como monto por paca × unidades, el transporte de fila que pisa al global solo si el string no está vacío, y los ítems con esPromocion excluidos del descuento. El propio cotizacion.js documenta que ya existió el bug de dos fórmulas cobrando distinto en la fila y en el total.

ORDEN DE LAS FILAS, rígido y no configurable:
 1. Productos con chip «cambió» (el inventario se movió o ella volvió a tocar el pedido).
 2. Productos que no alcanzan y no están «listo», por faltante descendente; empate por total pedido descendente.
 3. Productos que no alcanzan y ya están «listo» — SE QUEDAN EN SU SITIO, no bajan. Confirmar y ver la fila irse al final con el dedo puesto en la pantalla es cómo se pierde el sitio y se confirma el que no era. Solo cambian de aspecto.
 4. Los que alcanzan, alfabéticos por referencia y calidad.
El orden NO se recalcula mientras teclea: solo al cambiar de filtro, al pulsar «Listo» de otro producto o al reentrar en la fase.

BARRA PEGAJOSA (sticky top-[64px] z-10 bg-cream/95 backdrop-blur), dos filas más la cinta:
 Fila 1: [← Volver a los pedidos] · buscador «Buscar producto o cliente» con useDebounce(300) · checkbox «Sólo los que no alcanzan (3)», apagado por defecto · a la derecha «Inventario leído a las 10:42 · Volver a leer» en text-[11px] text-muted.
 Fila 2, role="status": punto ámbar de 6px + «Te faltan 3 decisiones» en text-sm font-semibold text-warning, que al llegar a cero pasa a punto verde + «Ya está todo repartido» en text-success. Al lado, en tabular-nums: «97 pedidas · 78 repartidas · 19 faltando a 5 clientes». Y mientras haya pendientes, un botón secundario «Aceptar los 3 repartos propuestos» — sí, eso permite despachar la ronda con un clic, pero es un clic SUYO sobre un botón que dice exactamente lo que hace con las cifras delante. Lo que no puede pasar es que nadie decida.
 Fila 3: la cinta de clientes, plegable con un chevron y recordado en localStorage dentro de try/catch.
NO hay tira de KPIs. La cinta de clientes ES la fila de indicadores y es más útil que cuatro tarjetas genéricas; además la ganadora repetía «POR DECIDIR 3» tres centímetros encima del contador que dice lo mismo, y en un portátil eso es fila y media de tabla perdida.

EL BUSCADOR FILTRA DE VERDAD. Si escribe «mixta», solo salen los que coinciden. La regla heredada de `clientesVisibles` («nunca esconder lo que ya tiene trabajo») protege allí trabajo YA HECHO; aquí protegería trabajo POR HACER, que no es lo mismo, y un buscador que sigue mostrando tres productos que no son mixta dejó de servir. En su lugar, una línea fija bajo el buscador: «3 decisiones pendientes ocultas por el filtro» con enlace para quitarlo.

PIE PEGAJOSO. Izquierda, role="status": «8 cliente(s) · 78 paca(s) repartidas · $131.280.000» y chip ámbar «Quedan faltando 19 paca(s) a 5 cliente(s)». Si alguien queda en cero, segunda línea en text-[11px] text-muted con los NOMBRES: «ANDREA no recibe nada: le quedan faltando 5.» Derecha: <Button icon={Save}>Crear 8 cotización(es) y anotar 19 faltante(s)</Button>, apagado mientras algún producto se pase del disponible, con el motivo pulsable debajo en text-[11px] text-warning: «Hay 1 producto repartido por encima de lo que hay (MIXTA INVIERNO / premium)» → lleva el foco ahí.

QUÉ SE BLOQUEA, en toda la pantalla, y nada más:
 (1) «Listo» apagado mientras el grupo se pase del disponible.
 (2) El botón de crear apagado si nada está asignado Y no hay ningún faltante que anotar, o si algún producto se pasa.
 Dejar mercancía sin repartir NO bloquea: puede estar guardándose pacas a propósito, y eso es una decisión de negocio. Se avisa en el contador y en el confirm, que es donde se avisa lo que no se prohíbe.

VALIDACIÓN EN VIVO, EN DOS TIEMPOS. Mientras teclea se admite cualquier número: si con tope 4 la celda saltara a «4» al primer dígito, el segundo produciría basura. Mientras esté por encima, borde error, la cabecera del grupo muestra «Te pasaste por 2» y «Listo» queda apagado. Al salir de la celda o al pulsar Enter se recorta al tope Y EL AVISO SOBREVIVE al recorte: «Lo bajé a 4: es lo que quedaba» — desaparecer justo en el instante del recorte es al revés de como debe ser. Dos textos distintos para los dos topes, porque son dos errores distintos: «Pidió 5, no puedo darle más» frente a «Solo quedan 4 sin repartir». Celda vacía o texto raro = 0, y en onBlur se pinta «0»: un hueco y un cero no pueden verse distinto.

TECLADO, CON GEMELO VISIBLE SIEMPRE. En cada fila el único control enfocable es «Le doy», así que Tab baja por la columna sin trucos de tabIndex (los botones del grupo llevan tabIndex={-1} o Tab haría 3 paradas de más por producto). Enter baja al siguiente cliente; en el último equivale a «Listo». Ctrl+Enter confirma el grupo y salta al siguiente producto por decidir con scrollIntoView({block:'center'}). Esc devuelve ESA celda al valor que tenía al enfocarla. Ningún atajo es el único camino: «Listo», «Vaciar» y el salto tienen botón visible, porque de pie en la bodega con una tableta no hay Ctrl ni Esc.

CONFIRMACIÓN FINAL, con nombres y sin eufemismos. useConfirm variant 'warning' cuando hay faltantes:
 título: «A 5 clientes les vas a cotizar menos de lo que pidieron»
 cuerpo: «Se crean 8 cotizaciones con 78 paca(s) apartadas por $131.280.000. Cada cotización sale SOLO con lo que le repartiste. Quedan anotadas 19 paca(s) faltando a MARIA (7), CAROLINA (5), JOSE (4), PEDRO (2) y LUZ (1). Ojo: eso no le aparta nada — esas pacas todavía no existen.»
 confirmText «Sí, crear y anotar los faltantes» · cancelText «Volver a repartir»
Si a alguien se le queda faltando menos de lo que ya se le debía porque pidió menos, se añade en el mismo diálogo, con el NO por defecto: «MARIA pidió 2 y le faltaban 5 de MIXTA INVIERNO / premium. ¿Damos por cerrado el resto (3)?» — la respuesta afirmativa va a cantidad_anulada con motivo, no a cantidad_saldada: no se le entregó, se le perdonó, y mezclarlas corrompe el libro.
Si NO hay faltantes, variant 'success' y el botón dice solo «Crear 8 cotización(es)». El módulo entero tiene que poder no existir cuando el negocio va bien.

EL EXCEL SE QUEDA DONDE ESTÁ, en el banner verde de éxito. No sube a la Fase 2, y el motivo es duro: hojaMatrizClientes se arma con GET /pacas/inventario y GET /pacas/comprometidas, o sea con lo GUARDADO en el servidor, así que bajado antes de crear entregaría una hoja con las columnas de cliente vacías. Y hay una segunda trampa: /pacas/inventario agrupa SIN LOWER mientras la pantalla agrupa con LOWER, así que «JEANS» y «Jeans» son dos filas en el Excel y una en la pantalla. Poner los dos a un clic de distancia invita a compararlos justo cuando no cuadran. Un botón que miente es peor que un botón que falta.

## Pantalla de seguimiento (/faltantes)

RUTA Y REGISTRO. `/faltantes`, pantalla propia y no pestaña dentro de la Matriz. La Matriz es una SESIÓN de trabajo que se vacía al terminar; el seguimiento se consulta en otro momento y casi siempre porque el cliente llamó preguntando. Meterlo como tercera pestaña la obligaría a abrir la pantalla de captura para contestar el teléfono, y emborrona el concepto de dos fases que es el corazón del rediseño. Hay que tocar CUATRO archivos a la vez: client/src/App.jsx (lazy + <Route path="/faltantes"> dentro de RutasAdmin, SIN <SoloAdmin>: la vendedora la necesita igual que la Matriz), Sidebar.jsx ({ path:'/faltantes', icon: PackageOpen, label:'Faltantes', key: null } entre '/despachos' y '/cuentas-pagar', para que el bloque se lea como el circuito completo de deudas en las dos direcciones), Layout.jsx ROUTE_NAMES ('/faltantes':'Faltantes' — y de paso '/separacion-masiva':'Matriz', que falta desde siempre y por eso la Matriz no tiene breadcrumb), y api.js (matrizApi al final).

TÍTULO. «Faltantes» · subtítulo «Lo que quedó sin entregar en repartos anteriores, cliente por cliente.»

CUATRO KPIs (grid grid-cols-2 md:grid-cols-4 gap-3, Card padding p-4, cifra en font-display text-xl tabular-nums):
 · CLIENTES CON FALTANTE · «5»
 · PACAS FALTANDO · «19»
 · VALOR DE LO QUE FALTA · «$32.300.000» / subtítulo obligatorio «al precio de cuando se pidió» — sin ese subtítulo alguien va a creer que es el precio de hoy
 · LO MÁS VIEJO · «29 días» / subtítulo «12/08 · MARIA · 3 repartos de espera»
Si la consulta falla, los cuatro muestran «—», JAMÁS «0».

FILTROS (Card, grid md:grid-cols-2 lg:grid-cols-5 gap-3): Buscar (cliente, referencia o ciudad, useDebounce 300) · Cliente · Referencia · Estado (Abiertos por defecto / Completados / Anulados / Todos) · Antigüedad (Todas / Más de 15 días / Más de 30 días). Y suelto, un checkbox que convierte esta pantalla en herramienta y no en informe: «Sólo lo que hoy alcanza» — cruza contra la disponibilidad actual y deja solo lo que podría entregar ya.

DOS VISTAS, segmentado en `actions` del Layout: «Ver por: [Cliente] Producto». Por cliente es la de por defecto, porque ella pidió literalmente «cuánto faltó por entregar a cada cliente». Por producto contesta la otra pregunta operativa («llegaron 40 jeans, ¿a quién se los debo?») y es la única que puede cruzar contra el stock de hoy.

VISTA POR CLIENTE. Mismo esqueleto que la Matriz: un <tbody> por cliente, rowSpan en la primera columna. Columnas: Cliente(rowSpan, w-[18%] min-w-[170px], con Badge 'inactivo' si aplica) · Referencia · Calidad · Pidió · Recibió · Falta (font-semibold text-warning tabular-nums, la que importa) · Precio · Valor · Desde («12/08 · 29 d», y debajo «3 repartos» con title «Este faltante nació en el reparto del 12/08/2026 y desde entonces se han hecho 3 repartos sin que le tocara») · acciones (dos botones-icono w-9 h-9). Pie por cliente: «TOTAL MARIA: 7 paca(s) · $12.100.000».
ORDEN POR DEFECTO: el bloque con la línea más VIEJA primero; empate por unidades descendente. Una paca de hace tres meses hace más daño comercial que ocho de ayer, y el volumen ya está a la vista en su columna mientras que la antigüedad se pierde si no se ordena por ella.
La columna «Estado» NO existe como columna: el Badge aparece como segunda línea dentro de «Desde» y SOLO cuando el filtro no es el de por defecto. En la vista normal todas las filas tienen el mismo estado y una columna entera repitiendo la misma palabra es ruido.
Franja ámbar sobre la tabla si hay alguno de 3 repartos o más: «Hay 4 faltante(s) esperando 3 repartos o más. Repártelos primero o anúlalos.»

VISTA POR PRODUCTO. Producto(rowSpan) · Disponible hoy(rowSpan, chip semáforo: verde «40 disp» + chip «alcanza para saldarlo» si cubre todo lo que se debe, ámbar si cubre parte, gris «sin stock» si 0) · Cliente · Ciudad · Falta · Desde · acciones. Pie por producto: «Se deben 12 · hay 40 disponibles» + Button ghost «Ir a la Matriz». Es enlace simple, no precarga: pasar líneas entre pantallas necesitaría un store que este proyecto no tiene, y el chip «alcanza para saldarlo» ya le dijo lo que necesitaba antes de ir.

ACCIÓN «COMPLETAR» (icono Check, hover text-success). Abre un Modal, no es un clic: es una decisión de cantidad, se escribe un dato, y un clic que da de baja mercancía es exactamente lo que se pulsa sin querer en tableta.
 Título «Marcar como entregado». Cuerpo: «MARIA · MIXTA INVIERNO / premium. Le quedaron faltando 3 desde el 12/08/2026 (29 días).» Campo «¿Cuántas le entregaste?» [3] de 3 · «Nota (opcional)». Permite parcial: si escribe 1, el botón pasa a «Marcar 1 como entregada» (singular) y aparece en vivo «Quedan 2 faltando.»
 Aviso innegociable dentro del modal: «Esto NO crea cotización ni despacho: sólo cierra lo que quedó faltando. Úsalo si ya se la entregaste por fuera del sistema o si el dato quedó mal.» Sin esa frase ella creería que la app despachó algo.
 Se registra con registrarAudit(pool, ...) después del COMMIT.

ACCIÓN «ANULAR» (icono X, hover text-error). confirm variant 'danger': «Se van a dar de baja 3 paca(s) de MIXTA INVIERNO / premium de MARIA. Deja de aparecer en la Matriz y en esta pantalla. El registro se conserva.» · «Sí, anular» / «Mejor no». Motivo OBLIGATORIO, mínimo 5 caracteres, en un campo del confirm. Exige rol admin Y SE VALIDA EN EL BACKEND, no solo en el front: anular borra una promesa hecha a un cliente y toda la gracia del módulo es que la memoria no se pueda limpiar sola. A la vendedora se le pinta el botón deshabilitado con title «Sólo un administrador puede anular», no escondido: escondido la deja preguntándose por qué no puede.
Admite anulación PARCIAL (campo `cantidad`), que es lo que consume el «¿damos por cerrado el resto?» de la Fase 2.

EXPORTAR. Button en `actions`: «Descargar Excel». Hoja `FALTANTES(BODEGA)` en client/src/lib/entregables.js, ciclo nuevoLibro() → hojaFaltantes(wb, filas) → await descargar(wb, 'FALTANTES'). Columnas en mayúsculas al estilo de las suyas: CLIENTE, CIUDAD, CELULAR, REFERENCIA, CALIDAD, PIDIO, RECIBIO, FALTA, PRECIO, VALOR, DESDE, DIAS, REPARTOS. Va al grupo de bodega/clientes y NO al de internos: lleva precio de venta, no costos. Y hay que registrarla en `hojasSel` y en los checkboxes de Entregables.jsx o esa pantalla la genera y la borra acto seguido, porque elimina por nombre las hojas no seleccionadas. Existe porque ella llama a los clientes con un papel al lado.

VISTA POR REPARTO. Desde el banner verde de éxito y desde un enlace de la cabecera: `/faltantes?reparto=MAT-10-09-2026-0004` muestra la foto de ese reparto — un bloque por cliente con lo que pidió, lo que recibió y lo que quedó faltando, y el número de su cotización. Es literalmente su frase: «saber que en esa entrega se le dieron tantos y quedaron faltando tantos».

TRES VACÍOS Y UN ERROR QUE NO ES UN VACÍO.
 1. Nunca ha quedado faltando nada → EmptyState icon PackageOpen, «No le estás quedando debiendo nada», «Cuando un reparto no alcance para todo lo que pidieron, aquí queda anotado a quién le faltó qué.», acción «Ir a la Matriz».
 2. Hay datos pero el filtro no devuelve nada → «Ningún faltante con ese filtro», «Hay 19 pacas faltando en total. Prueba quitando algún filtro.», acción ghost «Quitar el filtro».
 3. Filtro «Completados» y no hay ninguno → «Todavía no has completado ninguno», «Cuando entregues algo de lo que quedó faltando, va a quedar aquí el registro.»
 4. LA CONSULTA FALLÓ — esto NO es un vacío. Card con border-error/40 bg-error/10: «No pude consultar los faltantes.» / «Esto NO significa que no le debas nada a nadie: es que la consulta falló.» + botón «Reintentar». Y los KPIs en «—».

DÓNDE MÁS SE VE, con su coste.
· Clientes.jsx: SÍ. Una línea dentro del CardBody, «● Le faltaron 7 pacas», y la tarjeta enlaza a /faltantes?cliente_id=N. clientesApi.getAll no trae el dato, así que se resuelve con UNA sola petición agregada dentro del Promise.allSettled que la pantalla ya hace, y un Map en memoria. Una petición por tarjeta sería N+1 y es inaceptable. Si esa petición falla, la línea NO se pinta.
· Cartera.jsx: solo un renglón enlazado en el DETALLE del cliente — «Además le faltan 7 pacas de mercancía → Ver». NUNCA una columna ni un total. Cartera habla de plata de arriba abajo (saldo, abono, cupo, mora) y en su Excel SALDO PENDIENTE es dinero; meter unidades de mercancía en esa gramática fabrica el malentendido que todo el vocabulario intenta evitar. El enlace se queda porque cuando llama a cobrar, saber que además le debe mercancía cambia el tono de la llamada. Cero peticiones nuevas. Y es Cartera.jsx (interno), NUNCA CarteraCliente.jsx (portal).
· Sidebar: NO hay contador. `key` solo admite 'pacas'|'clientes'|'ventas', así que costaría tocar dashboardApi.getMetricas(), contadores.js y el vaciado al cerrar sesión, para un número que no cambia en todo el día salvo cuando ella misma reparte — y en ese momento ya lo tiene delante en el chip de la Matriz. Un badge que casi nunca cambia se vuelve invisible en una semana y cuando se queda rancio, miente.
· Dashboard: SÍ, un tile. El Dashboard YA llama a getMetricas(); añadir `unidades_faltando` y `clientes_con_faltante` es un SUM más sobre una consulta que ya se hace. Prácticamente gratis y en el sitio donde mira el estado global.
· Portal del cliente (ClienteDashboard, MisPedidos, CarteraCliente): NADA en la v1. Ver el apartado de suposiciones.

## Wireframes

```
════════════════════════════════════════════════════════════════════════════════════════════════════════════
 FASE 1 — MATRIZ · PEDIDOS        Fase 1 de 2 · Pedidos — anota lo que pidió cada cliente, aunque no alcance.
 Inicio › Matriz
════════════════════════════════════════════════════════════════════════════════════════════════════════════

╔═ sticky top-[64px] z-10 · bg-cream/95 backdrop-blur ══════════════════════════════════════════════════════╗
║ TASA DEL DÓLAR   TRANSPORTE/PACA   VALIDEZ (DÍAS)   BUSCAR CLIENTE                                        ║
║ [ 4.150      ]   [ 35.000      ]   [ 15         ]   [ ⌕ nombre o ciudad              ]                    ║
║ ☐ Ver sólo los que tienen ítems    ⟨● Le faltó a 5 clientes⟩      [ ↺ Cargar todo lo que faltó (19) ]     ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════╝

┌ ⚠ 3 productos no alcanzan para todo lo pedido. No es un error: los repartes en el paso 2. ────────────────┐
│   MIXTA INVIERNO / premium  hay 10 · piden 20   ·   SHORTS / supreme  hay 0 · piden 6   ·   +1 más        │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌ CLIENTE ───────────────┬ REFERENCIA ────────────────┬ CALIDAD ──┬ CANT.┬ PRECIO ────┬ SUBTOTAL ──┬───┐
│ MARIA                  │[MIXTA INVIERNO — 10 disp ▾]│[premium ▾]│ [  8]│  1.700.000 │ 13.600.000 │ ✕ │
│ Medellín · ●Le faltaron│  ⟨~ hay 10 · piden 20⟩  ⟨● 3 de antes⟩                                    │   │
│ 7                      ├────────────────────────────┼───────────┼──────┼────────────┼────────────┼───┤
│  ▲ chip = BOTÓN, pegado│[SHORTS — 0 disp          ▾]│[supreme ▾]│ [  4]│  1.900.000 │  7.600.000 │ ✕ │
│    a la línea de la    │  ⟨~ hay 0 · piden 6⟩  ⟨! sin existencias⟩                                 │   │
│    ciudad: CERO filas  ├────────────────────────────┼───────────┼──────┼────────────┼────────────┼───┤
│    nuevas              │[JEANS CLÁSICO — 22 disp  ▾]│[primera ▾]│ [  6]│  1.600.000 │  9.600.000 │ ✕ │
│                        │  ⟨= quedan 16⟩                                                            │   │
│ Cra 45 #12-30 ·        ├────────────────────────────┴───────────┴──────┴────────────┴────────────┴───┤
│ Medellín · 3105551234  │ + Ítem   + Lo que le faltó (7)   Transporte [        ]   Desc. 50.000/paca   │
│                        │                                                      Total     30.530.000   │
├────────────────────────┼────────────────────────────┬───────────┬──────┬────────────┬────────────┬───┤
│ JOSE                   │[MIXTA INVIERNO — 10 disp ▾]│[premium ▾]│ [  7]│  1.700.000 │ 11.900.000 │ ✕ │
│ Cali                   │  ⟨~ hay 10 · piden 20⟩                                                    │   │
│                        ├────────────────────────────┼───────────┼──────┼────────────┼────────────┼───┤
│                        │[JEANS CLÁSICO — 22 disp  ▾]│[primera ▾]│ [ 10]│  1.600.000 │ 16.000.000 │ ✕ │
│                        ├────────────────────────────┴───────────┴──────┴────────────┴────────────┴───┤
│                        │ + Ítem                    Transporte [        ]      Total     28.355.000   │
├────────────────────────┼──────────────────────────────────────────────────────────────────────────────┤
│ ANDREA · Pereira       │ + Ítem                                                                       │
│ ●Le faltaron 2         │   (cliente sin ítems: UNA fila, como hoy)                                    │
└────────────────────────┴──────────────────────────────────────────────────────────────────────────────┘

╔═ sticky bottom-4 z-10 · Card border-secondary/40 shadow-lg ═══════════════════════════════════════════════╗
║ 8 cliente(s) · 97 paca(s) pedidas · $163.415.000        ⓘ 2 línea(s) sin terminar no pasan al reparto    ║
║ Este total es lo PEDIDO. El de las cotizaciones sale en el paso 2, con lo que de verdad repartas.        ║
║                                                                    [ Repartir lo que hay  → ]           ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════╝

 ●Le faltaron 7 = punto ámbar 6px + texto text-warning font-semibold, dentro del <p> de la ciudad.
   title = «Le quedaron faltando a MARIA: 3 de MIXTA INVIERNO / premium — desde el 12/08/2026, 3 repartos
            de espera; 4 de SHORTS / supreme — desde el 03/09/2026. Son 7 pacas. Pulsa para agregarlas.»
 ⟨~ hay 10 · piden 20⟩ = chip ÁMBAR informativo. ANTES era rojo «Faltan 10» y apagaba el botón de guardar.


════════════════════════════════════════════════════════════════════════════════════════════════════════════
 FASE 2 — MATRIZ · REPARTO        Fase 2 de 2 · Reparto — reparte lo que hay. Lo que no alcance queda
                                  como faltante del cliente.
════════════════════════════════════════════════════════════════════════════════════════════════════════════

╔═ sticky top-[64px] z-10 ══════════════════════════════════════════════════════════════════════════════════╗
║ [← Volver a los pedidos]  ⌕[ Buscar producto o cliente ]  ☐ Sólo los que no alcanzan (3)                  ║
║                                              Inventario leído a las 10:42 · Volver a leer                 ║
║ ● Te faltan 3 decisiones    97 pedidas · 78 repartidas · 19 faltando a 5 clientes                         ║
║                             [ Aceptar los 3 repartos propuestos ]                                         ║
╟─ CINTA DE CLIENTES (la fila 2 de su Excel) ──────────────────────────────────── scroll horizontal ──  ⌃ ─╢
║ ┌MARIA──────┐┌JOSE───────┐┌CAROLINA───┐┌PEDRO──────┐┌LUZ────────┐┌ANDREA─────┐┌CARLOS─────┐┌DIANA─────┐ ║
║ │11/18  ●7  ││13/17  ●4  ││10/15  ●5  ││15/17  ●2  ││12/13  ●1  ││ 7/7       ││ 6/6       ││ 4/4      │ ║
║ │17.935.000 ││21.555.000 ││16.150.000 ││26.025.000 ││19.920.000 ││12.145.000 ││ 9.810.000 ││7.740.000 │ ║
║ └───────────┘└───────────┘└───────────┘└───────────┘└───────────┘└───────────┘└───────────┘└──────────┘ ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════╝

┌ PRODUCTO ────────────┬ CLIENTE ─────────┬PIDIÓ┬LE FALTABA┬ LE DOY ───┬QUEDA FALT.┬ PRECIO ──┬ VALOR ────┐
│ MIXTA INVIERNO       │ MARIA            │   8 │ ● 3      │ [  5]/8   │    ⬤ 3    │1.700.000 │ 8.500.000 │
│ premium              │ Medellín         │     │ desde    │    Todo   │           │          │           │
│                      │                  │     │ 12/08 ·  │           │           │          │           │
│ ⟨~ hay 10 · piden 20 │                  │     │ 3 rep.   │           │           │          │           │
│    · faltan 10⟩      ├──────────────────┼─────┼──────────┼───────────┼───────────┼──────────┼───────────┤
│ repartes 10 · libre 0│ JOSE             │   7 │    —     │ [  3]/7   │    ⬤ 4    │1.700.000 │ 5.100.000 │
│                      │ Cali             │     │          │    Todo   │           │          │           │
│ Repartir:            ├──────────────────┼─────┼──────────┼───────────┼───────────┼──────────┼───────────┤
│ [A prorrata]         │ CAROLINA         │   5 │    —     │ [  2]/5   │    ⬤ 3    │1.700.000 │ 3.400.000 │
│ [Por orden]          │ Bogotá           │     │          │    Todo   │           │          │           │
│ [Cubrir lo que faltó]├──────────────────┼─────┼──────────┼───────────┼───────────┼──────────┼───────────┤
│ [↺]      [ ✓ Listo ] │ Suma del producto│  20 │    3     │   10/10   │     10    │          │17.000.000 │
├──────────────────────┼──────────────────┼─────┼──────────┼───────────┼───────────┼──────────┼───────────┤
│ SHORTS               │ MARIA · Medellín │   4 │    —     │ [  0]/4   │    ⬤ 4    │1.900.000 │         0 │
│ supreme              ├──────────────────┼─────┼──────────┼───────────┼───────────┼──────────┼───────────┤
│ ⟨! no queda ninguna⟩ │ CAROLINA · Bogotá│   2 │    —     │ [  0]/2   │    ⬤ 2    │1.900.000 │         0 │
│ No hay ni una. Todo  ├──────────────────┼─────┼──────────┼───────────┼───────────┼──────────┼───────────┤
│ queda faltando.      │ Suma del producto│   6 │    —     │    0/0    │      6    │          │         0 │
│          [ ✓ Listo ] │                  │     │          │           │           │          │           │
├──────────────────────┼──────────────────┼─────┼──────────┼───────────┼───────────┼──────────┼───────────┤
│ CHAQUETA             │ PEDRO · Cartagena│   5 │    —     │ [  3]/5   │    ⬤ 2    │1.700.000 │ 5.100.000 │
│ premium              ├──────────────────┼─────┼──────────┼───────────┼───────────┼──────────┼───────────┤
│ ⟨~ hay 6 · piden 9   │ LUZ · Ibagué     │   4 │    —     │ [  3]/4   │    ⬤ 1    │1.700.000 │ 5.100.000 │
│    · faltan 3⟩       ├──────────────────┼─────┼──────────┼───────────┼───────────┼──────────┼───────────┤
│ repartes 6 · libre 0 │ Suma del producto│   9 │    —     │    6/6    │      3    │          │10.200.000 │
│          [ ✓ Listo ] │                  │     │          │           │           │          │           │
└──────────────────────┴──────────────────┴─────┴──────────┴───────────┴───────────┴──────────┴───────────┘

┌ LOS QUE ALCANZAN — una línea por producto, NO plegados en una franja ────────────────────────────────────┐
│ ✓ JEANS CLÁSICO · primera   22 pacas a 4 clientes · nadie queda faltando · libre 0            [ ⌄ ]      │
│ ✓ MIXTA VERANO · especial   14 pacas a 3 clientes · nadie queda faltando · libre 6 (gris)     [ ⌄ ]      │
│ ✓ BLUSAS · primera           9 pacas a 2 clientes · nadie queda faltando · libre 0            [ ⌄ ]      │
│ … 12 productos más, alfabéticos                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘

╔═ sticky bottom-4 z-10 ════════════════════════════════════════════════════════════════════════════════════╗
║ 8 cliente(s) · 78 paca(s) repartidas · $131.280.000    ⬤ Quedan faltando 19 paca(s) a 5 cliente(s)       ║
║                                            [ 💾 Crear 8 cotización(es) y anotar 19 faltante(s) ]         ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════╝

 COMPROBACIÓN ARITMÉTICA (todo visible sin desplazar):
   MIXTA INVIERNO  pedido 8+7+5 = 20 · hay 10 · repartido 5+3+2 = 10 · falta 3+4+3 = 10 = 20−10 ✓
   SHORTS          pedido 4+2 = 6 · hay 0 · repartido 0 · falta 6 ✓
   CHAQUETA        pedido 5+4 = 9 · hay 6 · repartido 3+3 = 6 · falta 2+1 = 3 = 9−6 ✓
   RONDA           pedido 20+6+9+62 = 97 · repartido 10+0+6+62 = 78 · falta 97−78 = 19 = 10+6+3 ✓
   POR CLIENTE     MARIA 11/18(−7) JOSE 13/17(−4) CAROLINA 10/15(−5) PEDRO 15/17(−2) LUZ 12/13(−1)
                   ANDREA 7/7 CARLOS 6/6 DIANA 4/4  →  suma pedido 97 · suma repartido 78 · faltantes 19 ✓
   MARIA EN PLATA  5×1.700.000 + 0×1.900.000 + 6×1.600.000 = 18.100.000
                   − descuento 11×50.000 = 550.000  + transporte 11×35.000 = 385.000  =  17.935.000 ✓
                   (lo PEDIDO habría sido 30.530.000: por eso el pie de la Fase 1 y el de la Fase 2
                    NO son el mismo número, y por eso el dinero de la Fase 2 se recalcula con
                    totalesFila sobre una proyección de `filas` con cantidad = asignada)


════════════════════════════════════════════════════════════════════════════════════════════════════════════
 /faltantes — SEGUIMIENTO      «Lo que quedó sin entregar en repartos anteriores, cliente por cliente.»
 Inicio › Faltantes                                    Ver por: ‹Cliente› Producto   [ ⭳ Descargar Excel ]
════════════════════════════════════════════════════════════════════════════════════════════════════════════

┌────────────────────┬────────────────────┬────────────────────┬────────────────────┐
│ CLIENTES CON       │ PACAS FALTANDO     │ VALOR DE LO QUE    │ LO MÁS VIEJO       │
│ FALTANTE           │                    │ FALTA              │                    │
│ 5                  │ 19                 │ $ 32.300.000       │ 29 días            │
│                    │                    │ al precio de       │ 12/08 · MARIA ·    │
│                    │                    │ cuando se pidió    │ 3 repartos         │
└────────────────────┴────────────────────┴────────────────────┴────────────────────┘
   (si la consulta falla, los CUATRO muestran «—», JAMÁS «0»)

┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ BUSCAR                CLIENTE        REFERENCIA     ESTADO         ANTIGÜEDAD                            │
│ [⌕ cliente, ref…  ]  [Todos     ▾] [Todas      ▾] [Abiertos   ▾] [Todas               ▾]                │
│ ☐ Sólo lo que hoy alcanza                                                                                │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌ ⚠ Hay 4 faltante(s) esperando 3 repartos o más. Repártelos primero o anúlalos. ─────────────────────────┐
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌ CLIENTE ──────┬ REFERENCIA ─────┬CALIDAD─┬PIDIÓ┬RECIBIÓ┬FALTA┬ PRECIO ──┬ VALOR ────┬ DESDE ───┬────┐
│ MARIA         │ MIXTA INVIERNO  │premium │   8 │     5 │   3 │1.700.000 │ 5.100.000 │ 12/08    │ ✓✕ │
│ Medellín      │                 │        │     │       │     │          │           │ 29 d     │    │
│               │                 │        │     │       │     │          │           │ 3 repar. │    │
│               ├─────────────────┼────────┼─────┼───────┼─────┼──────────┼───────────┼──────────┼────┤
│               │ SHORTS          │supreme │   4 │     0 │   4 │1.900.000 │ 7.600.000 │ 10/09    │ ✓✕ │
│               │                 │        │     │       │     │          │           │  0 d     │    │
│               ├─────────────────┴────────┴─────┴───────┼─────┼──────────┼───────────┴──────────┴────┤
│               │ TOTAL MARIA                            │   7 │          │12.700.000                 │
├───────────────┼─────────────────┬────────┬─────┬───────┼─────┼──────────┼───────────┬──────────┬────┤
│ CAROLINA      │ MIXTA INVIERNO  │premium │   5 │     2 │   3 │1.700.000 │ 5.100.000 │ 10/09    │ ✓✕ │
│ Bogotá        ├─────────────────┼────────┼─────┼───────┼─────┼──────────┼───────────┼──────────┼────┤
│               │ SHORTS          │supreme │   2 │     0 │   2 │1.900.000 │ 3.800.000 │ 10/09    │ ✓✕ │
│               ├─────────────────┴────────┴─────┴───────┼─────┼──────────┼───────────┴──────────┴────┤
│               │ TOTAL CAROLINA                         │   5 │          │ 8.900.000                 │
└───────────────┴────────────────────────────────────────┴─────┴──────────┴───────────────────────────┘
   ORDEN: el bloque con la línea MÁS VIEJA primero; empate por unidades descendente.
   ✓ = Completar (Modal, permite parcial)      ✕ = Anular (confirm danger, SOLO admin, motivo obligatorio)
   La columna ESTADO no existe: el Badge sale como 2ª línea de DESDE y sólo si el filtro no es «Abiertos».

┌ MODAL «Marcar como entregado» ───────────────────────────────────────────┐
│  MARIA · MIXTA INVIERNO / premium                                        │
│  Le quedaron faltando 3 desde el 12/08/2026 (29 días).                   │
│                                                                          │
│  ¿CUÁNTAS LE ENTREGASTE?   [   3   ]  de 3                               │
│  NOTA (OPCIONAL)           [ Se las llevó Andrés en la mula del jueves ] │
│                                                                          │
│  ⚠ Esto NO crea cotización ni despacho: sólo cierra lo que quedó         │
│    faltando. Úsalo si ya se la entregaste por fuera del sistema o si     │
│    el dato quedó mal.                                                    │
│                           [ Cancelar ]  [ Marcar 3 como entregadas ]     │
└──────────────────────────────────────────────────────────────────────────┘


════════════════════════════════════════════════════════════════════════════════════════════════════════════
 CICLO DE VIDA DEL FALTANTE (el libro consolidado)
════════════════════════════════════════════════════════════════════════════════════════════════════════════

  al COMMIT de repartir:  pedido > repartido  y  cuenta_faltante = true
              │
              │  ¿ya hay uno 'abierto' de ese cliente + referencia + calidad?
              ├─ SÍ → cantidad_original += faltante_nuevo ; veces_aplazado += 1
              │        (CONSERVA su created_at: la deuda no rejuvenece)
              └─ NO → INSERT (reparto_origen_id, precio_unitario_origen, veces_aplazado = 1)
                             │
                             v
                     ┌──────────────┐
              ┌────► │   abierto    │ ◄────┐  se ve en Fase 1, Fase 2, /faltantes,
              │      │ abierta > 0  │      │  Clientes.jsx, detalle de Cartera y Dashboard
              │      └──┬────────┬──┘      │
   vuelve a   │         │        │         │  ronda N+1: ella pulsa el chip, se carga al
   faltar ────┘         │        └─────────┘  pedido y lo repartido lo abona (parcial: baja, no cierra)
                        │
        ┌───────────────┴───────────────┐
        │ abierta llega a 0             │  admin anula (motivo obligatorio, auditado)
        v                               v
  ┌──────────────┐                ┌──────────────┐
  │  completado  │                │   anulado    │
  └──────────────┘                └──────────────┘

  NO HAY FLECHA DE «caduca». Ninguna transición ocurre por reloj.
  INVARIANTE: cantidad_original = cantidad_saldada + cantidad_anulada + cantidad_abierta   (SIEMPRE)

  ARITMÉTICA COMPLETA, el caso que rompía a las cuatro propuestas:
   Reparto 8   MARIA pide 5 de MIXTA/premium, hay 0 → recibe 0
               #12: original 5 · saldada 0 · anulada 0 · ABIERTA 5 · aplazado 1
   Reparto 9   pulsa el chip → pide 8 (3 cargadas del faltante + 5 nuevas), hay 3 → recibe 3
               abono = min(repartido 3, cargado 3) = 3
               faltante_nuevo = (8 − 3) − (3 − 3) = 5
               #12: original 10 · saldada 3 · ABIERTA 7 · aplazado 2   (2 viejas + 5 nuevas)
   Reparto 10  pide 2, hay 2 → recibe 2 ; responde SÍ a «¿cerramos el resto?»
               abono 2 · anulación 5
               #12: original 10 · saldada 5 · anulada 5 · ABIERTA 0 → 'completado'
```

## Modelo de datos y endpoints

TRES TABLAS, y el orden importa: matriz_faltantes va ANTES de matriz_lineas porque la línea apunta al faltante que abona, y si se invierte la FK no existe todavía y la sentencia falla EN SILENCIO (el bucle de migraciones solo hace console.log). Todo esto va como strings AL FINAL del arreglo `migracionesIndividuales` de src/index.js, justo antes del `];` de la línea 1014, con comentario en español del tono de los vecinos. Escribir solo src/db/migrations/007_matriz_faltantes.js NO EJECUTA NADA (runAllMigrations está comentado en la línea 69): ese archivo se crea por convención documental, copiando literal la estructura de 006_cotizacion_destino.js, y es rastro de intención.

────────────────────────────────────────────────────────────────────────────
-- La ronda de trabajo: de la primera línea capturada hasta que se reparte.
CREATE TABLE IF NOT EXISTS matriz_repartos (
  id                  SERIAL PRIMARY KEY,
  numero              VARCHAR(30),
  fecha               DATE NOT NULL,
  estado              VARCHAR(20) NOT NULL DEFAULT 'pedidos',
  vendedor_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  abierto_por         VARCHAR(100),
  tasa                DECIMAL(12,2) DEFAULT 0,
  transporte_unitario DECIMAL(12,2) DEFAULT 0,
  validez_dias        INTEGER NOT NULL DEFAULT 15,
  total_clientes      INTEGER NOT NULL DEFAULT 0,
  total_pedido        INTEGER NOT NULL DEFAULT 0,
  total_repartido     INTEGER NOT NULL DEFAULT 0,
  total_faltante      INTEGER NOT NULL DEFAULT 0,
  cerrado_en          TIMESTAMP,
  notas               TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- El libro de lo que se le queda faltando. UNA fila abierta por cliente +
-- referencia + calidad: ella piensa «a MARIA le debo 3 chaquetas premium»,
-- no «2 del reparto del 12 y 1 del reparto del 20». Vive FUERA del reparto.
CREATE TABLE IF NOT EXISTS matriz_faltantes (
  id                     SERIAL PRIMARY KEY,
  cliente_id             INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  referencia             VARCHAR(20) NOT NULL,
  calidad                VARCHAR(50),
  cantidad_original      INTEGER NOT NULL DEFAULT 0,
  cantidad_saldada       INTEGER NOT NULL DEFAULT 0,
  cantidad_anulada       INTEGER NOT NULL DEFAULT 0,
  cantidad_abierta       INTEGER NOT NULL DEFAULT 0,
  precio_unitario_origen DECIMAL(10,2) DEFAULT 0,
  tiene_promocion_origen BOOLEAN DEFAULT false,
  veces_aplazado         INTEGER NOT NULL DEFAULT 1,
  estado                 VARCHAR(20) NOT NULL DEFAULT 'abierto',
  visible_cliente        BOOLEAN NOT NULL DEFAULT false,
  reparto_origen_id      INTEGER REFERENCES matriz_repartos(id) ON DELETE SET NULL,
  reparto_ultimo_id      INTEGER REFERENCES matriz_repartos(id) ON DELETE SET NULL,
  motivo_anulacion       VARCHAR(200),
  anulado_por            INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  anulado_en             TIMESTAMP,
  nota                   TEXT,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lo capturado y repartido en ESE reparto: una fila por cliente × producto.
-- Al cerrar no se toca más. Es el histórico de «qué pidió y qué recibió ese día»,
-- que es la frase literal del encargo.
CREATE TABLE IF NOT EXISTS matriz_lineas (
  id                        SERIAL PRIMARY KEY,
  reparto_id                INTEGER NOT NULL REFERENCES matriz_repartos(id) ON DELETE CASCADE,
  cliente_id                INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  orden                     INTEGER NOT NULL DEFAULT 0,
  referencia                VARCHAR(20) NOT NULL,
  calidad                   VARCHAR(50),
  clasificacion             VARCHAR(50),
  cantidad_pedida           INTEGER NOT NULL DEFAULT 0,
  cantidad_cargada_faltante INTEGER NOT NULL DEFAULT 0,
  cantidad_repartida        INTEGER NOT NULL DEFAULT 0,
  cantidad_faltante         INTEGER NOT NULL DEFAULT 0,
  precio_unitario           DECIMAL(10,2) NOT NULL DEFAULT 0,
  tiene_promocion           BOOLEAN DEFAULT false,
  respeta_precio_origen     BOOLEAN NOT NULL DEFAULT false,
  cuenta_faltante           BOOLEAN NOT NULL DEFAULT true,
  faltante_id               INTEGER REFERENCES matriz_faltantes(id) ON DELETE SET NULL,
  cotizacion_id             INTEGER REFERENCES cotizaciones(id) ON DELETE SET NULL,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_matriz_repartos_estado   ON matriz_repartos(estado);
CREATE INDEX IF NOT EXISTS idx_matriz_repartos_fecha    ON matriz_repartos(fecha);
CREATE INDEX IF NOT EXISTS idx_matriz_faltantes_cliente ON matriz_faltantes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_matriz_faltantes_estado  ON matriz_faltantes(cliente_id, estado);
CREATE INDEX IF NOT EXISTS idx_matriz_lineas_reparto    ON matriz_lineas(reparto_id);
CREATE INDEX IF NOT EXISTS idx_matriz_lineas_cliente    ON matriz_lineas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_matriz_lineas_faltante   ON matriz_lineas(faltante_id);

-- Índices únicos: son RED, no garantía. Este bucle se traga los errores con un
-- console.log, así que un índice que no se llegue a crear dejaría a todos creyendo
-- que la BD protege algo que no protege. La garantía vive en src/routes/matriz.js.
-- LOWER porque TODO el repo compara catálogo en minúsculas: sin él «JEANS» y «Jeans»
-- serían dos faltantes distintos del mismo cliente y solo se notaría meses después.
CREATE UNIQUE INDEX IF NOT EXISTS idx_matriz_faltantes_abierto
  ON matriz_faltantes (cliente_id, LOWER(referencia), LOWER(COALESCE(calidad, '')))
  WHERE estado = 'abierto';
CREATE UNIQUE INDEX IF NOT EXISTS idx_matriz_repartos_uno_abierto
  ON matriz_repartos ((estado IN ('pedidos','reparto')))
  WHERE estado IN ('pedidos','reparto');
CREATE UNIQUE INDEX IF NOT EXISTS idx_matriz_lineas_unica
  ON matriz_lineas (reparto_id, cliente_id, LOWER(referencia), LOWER(COALESCE(calidad, '')));
────────────────────────────────────────────────────────────────────────────

DECISIONES INCRUSTADAS EN ESA FORMA
· Prefijo `matriz_` en las tres para no confundirse JAMÁS con `pedidos`/`detalle_pedido` (portal legacy) ni con `reservas` (estado 'reservada' que ningún otro flujo entiende).
· El estado NO se llama 'pendiente' en ninguna parte: 'abierto'|'completado'|'anulado'. Esa palabra ya significa tres cosas en la app.
· cantidad_abierta se MATERIALIZA, no se deriva: «lo que le falta a este cliente» tiene que ser un WHERE estado='abierto' sin recorrer repartos.
· `cuenta_faltante` (DEFAULT true) resuelve por adelantado el caso del cliente que pide 50 sabiendo que hay 10 «a ver si suena la flauta»: una casilla por línea la deja decir «esto no queda debiendo». Sin eso el libro se llena de deuda falsa y el chip deja de significar nada.
· `respeta_precio_origen` deja escrito por qué a un cliente se le cobró 1.700.000 y a otro 1.900.000 la misma paca el mismo día.
· `visible_cliente` nace hoy en false. Cuesta una columna ahora y evita migrar mañana una tabla con historia.
· `fecha DATE NOT NULL` SIN DEFAULT CURRENT_DATE: la ruta escribe hoyCO(). Railway corre en UTC y a partir de las 7 de la noche en Colombia CURRENT_DATE ya es mañana. Un DEFAULT conocido-mal es peor que no tener DEFAULT: sin él, olvidarlo revienta con ruido en vez de fechar mal en silencio.
· Sin uuid, sin ENUM, sin CHECK — las tablas nuevas del repo (bancos, paca_familias, inversionistas, tipos_transporte) ya no llevan uuid, y la validación vive en las rutas.
· `numero` con formato MAT-dd-mm-aaaa-NNNN obliga a añadir 'matriz_repartos' al Set TABLAS de src/utils/consecutivo.js:12 o siguienteNumero lanza; ese Set es además la única defensa contra inyección porque el helper interpola el nombre de tabla. Y usa una constante de advisory lock NUEVA: 5555555 (1111111, 2222222, 3333333 y 4444444 ya están tomadas).

ENDPOINTS NUEVOS — archivo NUEVO src/routes/matriz.js, montado con app.use('/api/matriz', require('./routes/matriz')) junto a los demás. Rutas literales ANTES de cualquier /:id. Lectura = autentificar + requiereRol('admin','vendedor'). Escritura = igual. Anulación = requiereRol('admin') a secas. NUNCA autentificarCliente: un token del portal recibe 403.

 1. GET   /api/matriz/faltantes?cliente_id=&estado=
    → { generado_en, total_clientes, total_unidades, faltantes:[{ id, cliente_id, cliente_nombre, referencia, calidad, cantidad_abierta, cantidad_original, cantidad_saldada, precio_unitario_origen, tiene_promocion_origen, veces_aplazado, dias_abierto, reparto_origen_numero, created_at }] }
    Devuelve OBJETO y no arreglo plano, rompiendo a propósito la convención de GET del repo: un [] no distingue «no le falta nada a nadie» de «me quedé sin datos», y la regla de oro del frontend prohíbe pintar un cero que se lea como «no debe nada» cuando falló la consulta. `generado_en` es la prueba positiva de que la respuesta es real. UNA sola llamada agregada para TODOS los clientes, jamás una por cliente.
    `dias_abierto` se calcula con ($2::date − created_at::date) pasando hoyCO(), NO CURRENT_DATE.
 2. GET   /api/matriz/repartos/abierto              → { reparto, lineas } o { reparto: null }
 3. POST  /api/matriz/repartos                      → 201 { reparto, reutilizado:bool }
    pg_advisory_xact_lock(5555555) + SELECT ... WHERE estado IN ('pedidos','reparto') FOR UPDATE; si ya hay una, se devuelve con reutilizado:true en vez de crear otra.
 4. PUT   /api/matriz/repartos/:id/cliente/:clienteId  { lineas:[...] }  → autoguardado por cliente
    DELETE + INSERT de las líneas de ESE cliente en ESE reparto. Coincide exactamente con la frontera del React.memo de FilaCliente, el cuerpo es diminuto (≤10 líneas) y si falla el error se pinta DENTRO del <tbody> de ese cliente, que es el patrón que ya usa err.datos.problemas.
 5. POST  /api/matriz/repartos/:id/cerrar-pedidos   { clientes:[...] }
    → { reparto, productos:[{ referencia, calidad, disponibles, pedido_total, clientes:[{cliente_id, cliente_nombre, pedida, cargada_faltante, precio_unitario, faltante_abierto, precio_unitario_origen}] }], stock_leido_en }
    La relectura del stock viaja EN LA MISMA respuesta que la matriz pivotada: que la lectura y la respuesta vayan juntas elimina una carrera entera.
 6. POST  /api/matriz/repartos/:id/repartir   { tasa, transporte_unitario, validez_dias, asignaciones:[{cliente_id, referencia, calidad, cantidad_repartida, precio_unitario, respeta_precio_origen?, cuenta_faltante?}], cierres_faltante:[{faltante_id, cantidad, motivo}] }
    → 201 { reparto, creadas:[...], faltantes_nuevos:[...], faltantes_saldados:[...], total_cotizaciones, total_unidades, total_faltante }
    ERROR: conserva el contrato de /masiva TAL CUAL — 400 { error, problemas:[{cliente_id, cliente_nombre, referencia, calidad, solicitadas, disponibles, mensaje}] } con cliente_id en cada entrada, porque de eso depende que la pantalla siga repartiendo mensajes por fila. Añade 409 { error:'Este reparto ya se cerró. Recarga la pantalla.' } cuando el estado no es 'reparto'.
 7. POST  /api/matriz/repartos/:id/volver           → 'reparto' vuelve a 'pedidos'
 8. POST  /api/matriz/repartos/:id/descartar        { motivo? }  → solo desde 'pedidos'
 9. POST  /api/matriz/faltantes/:id/completar       { cantidad, nota }
10. PATCH /api/matriz/faltantes/:id/anular          { cantidad?, motivo }   ← requiereRol('admin')
11. GET   /api/matriz/repartos?desde=&hasta=
12. GET   /api/matriz/repartos/:id → { reparto, clientes:[{cliente_id, cliente_nombre, cotizacion_id, cotizacion_numero, lineas:[...]}] } — el «qué se entregó y cuánto faltó a cada cliente» de esa entrega.

PARSER DE BODY. En src/index.js, inmediatamente DESPUÉS de la línea 44 y ANTES de la 45, imitando el patrón existente:
  app.use('/api/matriz', express.json({ limit: '2mb' }));
Va para TODO el prefijo, no solo para repartir: el autoguardado por cliente, el cierre de fase y el reparto llevan cuerpo grande. 2mb y no 5mb porque 200 clientes × 5 líneas ≈ 120 kB, o sea diez veces de margen. Sin esta línea la petición muere con 413 antes de llegar a la ruta.

REFACTOR OBLIGATORIO EN cotizaciones.js, y no es opcional. `POST /matriz/repartos/:id/repartir` NO puede llamar a /masiva por HTTP (dejaría cotizaciones creadas y faltantes perdidos si algo revienta en medio) ni clonar sus ~190 líneas de mecánica (es exactamente cómo PUT /cotizaciones/:id divergió y perdió el parseInt de validez_dias). Se extrae el bucle de reserva de POST /masiva a un helper exportado:
  separarParaClientes(client, planes) → { creadas, problemas }
con la pieza crítica dentro: `const reservadasEnEsteEnvio = []` — UNA sola lista para TODA la petición. Si alguien la mueve dentro del bucle de clientes, dos clientes se llevan LAS MISMAS pacas y la bodega lo descubre al despachar. POST /masiva pasa a usar el helper y `node tests/separacion-masiva.test.js` sigue pasando sin tocarlo (el helper conserva el orden exacto de parámetros [clasificacion, categoria, referencia, calidad, limite, reservadas] que ese test asume). Además hay que exportar `crearCotizacionEnTx` igual que ya se exporta reservarPacas: después del module.exports = router, con comentario que lo justifique.
Todo el reparto —cotizaciones, líneas, faltantes y cierre— ocurre en UN solo BEGIN…COMMIT, con la regla crítica del repo: todo `return` de error DENTRO de la transacción hace `await client.query('ROLLBACK')` ANTES, porque el finally solo suelta la conexión y sin rollback vuelve al pool con la transacción abierta. registrarAudit va DESPUÉS del COMMIT, con el pool y no con el client, en su propio try/catch.
Ventaja concreta de tener ruta propia: un reparto 100% faltante (llegó poca mercancía o ninguna, todo el mundo se queda esperando) SÍ se puede guardar — escribe los faltantes y responde 201 con creadas: []. Por /masiva sería un 400 «No hay nada que separar» y se perdería la ronda más dolorosa de todas, que es justo la que más hay que registrar.

LA ARITMÉTICA DEL LIBRO, en UN solo helper puro. `src/utils/faltantes.js` → `aplicarMovimiento(faltante, { suma, salda, anula })`, y su gemelo en `client/src/lib/faltantes.js` para que la pantalla pueda previsualizar «quedará faltando 7» sin ir al servidor. Son dos repos y no se puede compartir el archivo; la defensa es que la función tiene cinco líneas y que tests/matriz-faltantes.test.js comprueba las MISMAS tablas de casos en los dos lados.
  const original = f.cantidad_original + suma;
  const saldada  = Math.min(original - f.cantidad_anulada, f.cantidad_saldada + salda);
  const anulada  = Math.min(original - saldada,            f.cantidad_anulada + anula);
  const abierta  = Math.max(0, original - saldada - anulada);
  const estado   = abierta > 0 ? 'abierto' : (saldada > 0 ? 'completado' : 'anulado');
Y por línea, dentro de repartir:
  abono           = Math.min(repartida, cargada_faltante);
  faltante_nuevo  = cuenta_faltante ? Math.max(0, (pedida - cargada_faltante) - (repartida - abono)) : 0;
  → aplicarMovimiento(f, { suma: faltante_nuevo, salda: abono, anula: 0 })
Comprobado: pedía 5 y no había → abierta 5. Carga 3, pide 8, recibe 3 → abono 3, faltante_nuevo 5, original 10, saldada 3, abierta 7 (2 viejas + 5 nuevas). Pide 2, recibe 2 y cierra el resto → saldada 5, anulada 5, abierta 0, 'completado'.

INVARIANTES Y DÓNDE SE GARANTIZAN. Ninguna garantía vive SOLO en la BD, porque migracionesIndividuales mete cada sentencia en su propio try/catch que solo hace console.log: un CHECK que falla al crearse deja a todos creyendo que la base protege algo que no protege.
 I1 Σ repartido por producto ≤ disponible → lo garantiza reservarPacas con FOR UPDATE SKIP LOCKED y la lista compartida. El tope de la pantalla es comodidad, no garantía.
 I2 repartido ≤ pedido por cliente → `repartir` NO confía en el body: lee cantidad_pedida de matriz_lineas DENTRO de la transacción y aplica LEAST(body, línea), con GREATEST(0, ...) para el negativo.
 I3 faltante = pedida − repartida → se calcula en el servidor al cerrar, nunca se recibe del cliente.
 I4 ninguna paca dos veces → cotizacion_pacas tiene UNIQUE(cotizacion_id, paca_id); reservarPacas solo toma 'disponible'; y `repartir` empieza con SELECT ... FROM matriz_repartos WHERE id=$1 FOR UPDATE y aborta con 409 si el estado no es 'reparto'. Eso mata el doble clic y el reintento tras un timeout de red, que es el caso que «ya duplicó abonos en este proyecto».
 I5 original = saldada + anulada + abierta → el helper de arriba, único escritor de esas cuatro columnas.
 I6 un solo faltante abierto por cliente+ref+calidad → SELECT ... FOR UPDATE con LOWER=LOWER y luego UPDATE o INSERT. Las rutas NUNCA capturan unique_violation como control de flujo.
 I7 un solo reparto abierto → advisory lock 5555555 + FOR UPDATE.
PRUEBAS: tests/matriz-faltantes.test.js y tests/matriz-reparto.test.js en el estilo del repo (sin framework, comprobar(etiqueta, real, esperado), ✅/❌, process.exit(malos ? 1 : 0), BD simulada con .query(sql, params)). Casos mínimos: piden 20 hay 10 entre 3 → Σ repartido 10 y Σ faltante 10; la secuencia completa del libro de arriba; asignar 99 sobre una línea de 8 → se topa en 8; repartir dos veces el mismo reparto → 409 y cero escrituras; a prorrata con 8/7/5 sobre 10 → 4/4/2 y nunca más ni menos que el disponible.

EL PAYLOAD DE LOS DETALLES NO CAMBIA. Siguen SIN llevar `clasificacion` ni `tipo`. Hoy eso es lo que hace que reservarPacas empareje SOLO por referencia+calidad, que es exactamente la clave claveStock del reparto de la pantalla. Si alguien lo «mejora» añadiendo clasificacion, la reserva se vuelve más estricta que el reparto y aparecen faltantes que la pantalla no predijo. Está escrito en el comentario del código nuevo con esa frase.

CLIENTE DE API, al final de client/src/services/api.js, con el patrón literal del repo (objeto literal, métodos shorthand, qs(params) en toda query string):
  export const matrizApi = {
    getFaltantes(params = {}) { return api.get(`/matriz/faltantes${qs(params)}`); },
    getRepartoAbierto() { return api.get('/matriz/repartos/abierto'); },
    crearReparto(data) { return api.post('/matriz/repartos', data); },
    guardarCliente(id, clienteId, data) { return api.put(`/matriz/repartos/${id}/cliente/${clienteId}`, data); },
    cerrarPedidos(id, data) { return api.post(`/matriz/repartos/${id}/cerrar-pedidos`, data); },
    repartir(id, data) { return api.post(`/matriz/repartos/${id}/repartir`, data); },
    volver(id) { return api.post(`/matriz/repartos/${id}/volver`, {}); },
    descartar(id, data) { return api.post(`/matriz/repartos/${id}/descartar`, data); },
    completarFaltante(id, data) { return api.post(`/matriz/faltantes/${id}/completar`, data); },
    anularFaltante(id, data) { return api.patch(`/matriz/faltantes/${id}/anular`, data); },
    getRepartos(params = {}) { return api.get(`/matriz/repartos${qs(params)}`); },
    getReparto(id) { return api.get(`/matriz/repartos/${id}`); },
  };
OJO CON LOS PERMISOS ANTES DE EXPONER NADA: handleResponse redirige a /login ante CUALQUIER 401 fuera del login. Si el endpoint nuevo queda mal permisado y ella lo llama desde la Matriz con la pantalla llena, pierde toda la captura. Hay que probar los roles reales antes de que la ruta salga.

## Textos de interfaz

- Subtítulo Fase 1: «Fase 1 de 2 · Pedidos — anota lo que pidió cada cliente, aunque no alcance.»
- Subtítulo Fase 2: «Fase 2 de 2 · Reparto — reparte lo que hay. Lo que no alcance queda como faltante del cliente.»
- Chip de stock cuando no alcanza (ÁMBAR, antes rojo «Faltan 10»): «hay 10 · piden 20» — title: «Hay 10 disponibles y entre todos los clientes se piden 20. No es un error: en el paso 2 decides quién se lleva qué.»
- Chip de stock con margen corto: «quedan 2» · holgado: «quedan 16»
- Chip de referencia agotada en Fase 1: «sin existencias» — title: «Hoy no hay ninguna. Puedes anotar el pedido igual: en el reparto quedará faltando entero.»
- Franja ámbar Fase 1: «3 productos no alcanzan para todo lo pedido. No es un error: los repartes en el paso 2.» + segunda línea «MIXTA INVIERNO / premium hay 10 · piden 20 · SHORTS / supreme hay 0 · piden 6 · +1 más»
- Chip del cliente (es un BOTÓN): «Le faltaron 7» · un solo producto: «Le faltaron 3» · title: «Le quedaron faltando a MARIA: 3 de MIXTA INVIERNO / premium — desde el 12/08/2026, 3 repartos de espera; 4 de SHORTS / supreme — desde el 03/09/2026. Son 7 pacas. Pulsa para agregarlas al pedido.»
- Botón por cliente: «+ Lo que le faltó (7)» · a medias: «+ Lo que le faltó (2 restantes)» · agotado: «Ya está cargado»
- Botón global de la barra: «↺ Cargar todo lo que faltó (19)»
- Confirmación de ese botón (variant success): título «Cargar lo que faltó» · cuerpo «Se van a agregar 19 pacas en 11 líneas a 5 clientes. A los que ya tienen esa misma referencia y calidad se les suma a la línea que ya está puesta. Después puedes cambiar o quitar lo que quieras.» · «Sí, cargarlo» / «Ahora no»
- Toast al cargar: «Se cargaron 19 pacas a 5 clientes. Revisa los precios.»
- Chip en la línea cargada: «3 de antes» — title: «3 de estas 8 vienen de lo que le quedó faltando el 12/08/2026. Al repartir, lo que le des cubre PRIMERO esas 3.»
- Chip de precio movido: «Precio cambió» — title: «Se lo debíamos a $1.700.000 y hoy vale $1.900.000. Está puesto el de hoy; pulsa para respetarle el anterior.»
- Contador-filtro de la barra: «Le faltó a 5 clientes» · singular: «Le faltó a 1 cliente»
- Aviso de carga fallida: «No pude leer lo que quedó faltando de repartos anteriores. Que no aparezca el aviso NO significa que no le debas nada a nadie.»
- Pie Fase 1: «8 cliente(s) · 97 paca(s) pedidas · $163.415.000» + «2 línea(s) sin terminar no pasan al reparto» + «Este total es lo PEDIDO. El de las cotizaciones sale en el paso 2, con lo que de verdad repartas.»
- Botón de paso: «Repartir lo que hay» · mientras trabaja: «Revisando el inventario…»
- Impedimentos de Fase 1 (los únicos dos que quedan): «Todavía se están cargando los datos.» / «Todavía no hay ningún cliente con ítems completos.»
- Confirmación al cruzar, solo si hay líneas a medias (variant info): título «Hay 2 línea(s) sin terminar» · cuerpo «Les falta la calidad o el precio, así que no pasan al reparto: MARIA (1) y PEDRO (1).» · «Seguir al reparto» / «Volver a revisar»
- Franja si la relectura falla: «No pude confirmar el inventario. Lo que ves es la lectura de las 10:42. Si otra persona apartó pacas, al crear las cotizaciones puede faltar.» + «Reintentar»
- Franja si el inventario cambió: «El inventario cambió mientras capturabas: 2 productos tienen menos que hace un rato.» + chip por fila «cambió»
- Sello de hora, siempre visible: «Inventario leído a las 10:42 · Volver a leer»
- Aviso de reconciliación al reentrar: «Reajusté el reparto de 2 productos porque cambiaron los pedidos.» + chip «2 producto(s) para revisar»
- Botón de vuelta: «Volver a los pedidos»
- Cabeceras Fase 2: PRODUCTO · CLIENTE · PIDIÓ · LE FALTABA · LE DOY · QUEDA FALTANDO · PRECIO · VALOR
- caption sr-only Fase 2: «Reparto por producto: dentro de cada producto, una fila por cada cliente que lo pidió y la cantidad que se le entrega.»
- Chip de escasez del producto: «hay 10 · piden 20 · faltan 10» · alcanza: «alcanza para todos» · agotado: «no queda ninguna»
- Contador vivo del producto: «repartes 10 · libre 0» · «repartes 7 · libre 3»
- Fila sin nada que repartir: «No hay ni una. Todo queda faltando.»
- Botones de reparto: «A prorrata» (title «Reparte las 10 en proporción a lo que pidió cada uno; las sueltas van al que más pidió») · «Por orden» (title «Llena de arriba abajo hasta que se acaben, igual que reserva el servidor») · «Cubrir lo que faltó» (title «Primero le repone a quien le quedó faltando de repartos pasados»)
- Botón de vaciar: aria-label «Vaciar el reparto de este producto»
- Botón por producto: «Listo» / una vez confirmado: «Cambiar»
- aria-label de la celda: «Le doy a MARIA de MIXTA INVIERNO premium; pidió 8, hay 10 disponibles» · sufijo visible «/8»
- Botón de fila: «Todo» — aria-label «Darle a MARIA todo lo que se pueda de MIXTA INVIERNO premium»
- Segunda línea de LE FALTABA (visible, no en title): «desde 12/08 · 3 repartos»
- Aviso al pasarse del pedido: «Pidió 5, no puedo darle más» · al pasarse del disponible: «Solo quedan 4 sin repartir» · tras el recorte: «Lo bajé a 4: es lo que quedaba»
- Error del grupo: «Te pasaste por 2» — title: «Estás repartiendo 12 y solo hay 10. Quítale a alguien.»
- Nota tranquila: «Dejas 3 sin repartir» — title: «Puedes dejar pacas sin repartir si las quieres guardar.»
- Chip de precio en Fase 2: «Respetar 1.700.000» + «hoy 1.900.000, +200.000»
- Línea de producto que alcanza: «JEANS CLÁSICO · primera — 22 pacas a 4 clientes · nadie queda faltando»
- Contador principal: «Te faltan 3 decisiones» → al llegar a cero: «Ya está todo repartido»
- Cifras de la barra: «97 pedidas · 78 repartidas · 19 faltando a 5 clientes»
- Atajo: «Aceptar los 3 repartos propuestos» — title: «Confirma de una vez los repartos que no has tocado. Puedes cambiarlos después.»
- Buscador Fase 2: «Buscar producto o cliente» + línea fija «3 decisiones pendientes ocultas por el filtro» + «Quitar el filtro»
- Tarjeta de la cinta de clientes: «MARIA · 11/18 · ●7 · $17.935.000» · cliente en cero: chip «sin nada» — title «A ANDREA no le tocó nada: le quedan faltando 5.»
- Aviso de flete en la cinta: «⚠ 2 pacas» — title: «Con 2 pacas el flete son $70.000 sobre $3.400.000. Revisa si vale la pena despacharle.»
- Pie Fase 2: «8 cliente(s) · 78 paca(s) repartidas · $131.280.000» + chip «Quedan faltando 19 paca(s) a 5 cliente(s)» + «ANDREA no recibe nada: le quedan faltando 5.»
- Botón final: «Crear 8 cotización(es) y anotar 19 faltante(s)» · sin faltantes: «Crear 8 cotización(es)» · enviando: «Creando…»
- Impedimento del botón final (pulsable): «Hay 1 producto repartido por encima de lo que hay (MIXTA INVIERNO / premium)»
- Confirmación final con faltantes (variant warning): título «A 5 clientes les vas a cotizar menos de lo que pidieron» · cuerpo «Se crean 8 cotizaciones con 78 paca(s) apartadas por $131.280.000. Cada cotización sale SOLO con lo que le repartiste. Quedan anotadas 19 paca(s) faltando a MARIA (7), CAROLINA (5), JOSE (4), PEDRO (2) y LUZ (1). Ojo: eso no le aparta nada — esas pacas todavía no existen.» · «Sí, crear y anotar los faltantes» / «Volver a repartir»
- Pregunta de cierre dentro del mismo diálogo (NO por defecto): «MARIA pidió 2 y le faltaban 5 de MIXTA INVIERNO / premium. ¿Damos por cerrado el resto (3)?» · «Sí, dar por cerrado» / «No, seguimos debiéndoselo»
- Toast de éxito: «Se crearon 8 cotización(es) con 78 paca(s) apartadas. Anoté 19 paca(s) faltando a 5 cliente(s).»
- Error del servidor: «No se creó nada. Se apartaron pacas mientras repartías: revisa los 2 producto(s) marcados en rojo y vuelve a repartir.»
- Banner verde: «Listo.» + «Ver cotizaciones» · «Descargar matriz en Excel» · «Ver lo que quedó faltando»
- Vacío de Fase 2: título «Nada que repartir» · «Todo alcanza para todos. Revisa si quieres y crea las cotizaciones.»
- Pantalla de seguimiento: «Faltantes» · subtítulo «Lo que quedó sin entregar en repartos anteriores, cliente por cliente.»
- KPIs: «Clientes con faltante» · «Pacas faltando» · «Valor de lo que falta» / «al precio de cuando se pidió» · «Lo más viejo» / «12/08 · MARIA · 3 repartos»
- Columnas de seguimiento: CLIENTE · REFERENCIA · CALIDAD · PIDIÓ · RECIBIÓ · FALTA · PRECIO · VALOR · DESDE
- Celda DESDE: «12/08 · 29 d» + «3 repartos» — title: «Este faltante nació en el reparto del 12/08/2026 y desde entonces se han hecho 3 repartos sin que le tocara.»
- Franja de escalada: «Hay 4 faltante(s) esperando 3 repartos o más. Repártelos primero o anúlalos.»
- Filtro estrella: «Sólo lo que hoy alcanza» · chip por producto: «alcanza para saldarlo»
- Modal de completar: título «Marcar como entregado» · «¿Cuántas le entregaste?» · «Nota (opcional)» · «Esto NO crea cotización ni despacho: sólo cierra lo que quedó faltando. Úsalo si ya se la entregaste por fuera del sistema o si el dato quedó mal.» · «Marcar 3 como entregadas» / parcial: «Marcar 1 como entregada» + «Quedan 2 faltando.»
- Confirmación de anular (variant danger): título «Anular lo que quedó faltando» · cuerpo «Se van a dar de baja 3 paca(s) de MIXTA INVIERNO / premium de MARIA. Deja de aparecer en la Matriz y en esta pantalla. El registro se conserva.» · campo «¿Por qué se anula? (queda registrado)» · «Sí, anular» / «Mejor no»
- Botón sin permiso: title «Sólo un administrador puede anular»
- Vacíos de la pantalla: «No le estás quedando debiendo nada» / «Cuando un reparto no alcance para todo lo que pidieron, aquí queda anotado a quién le faltó qué.» — «Ningún faltante con ese filtro» / «Hay 19 pacas faltando en total. Prueba quitando algún filtro.» + «Quitar el filtro» — «Todavía no has completado ninguno»
- Error de la pantalla (NO es un vacío): «No pude consultar los faltantes.» / «Esto NO significa que no le debas nada a nadie: es que la consulta falló.» + «Reintentar»
- Clientes.jsx: «● Le faltaron 7 pacas» · Cartera (solo en el detalle): «Además le faltan 7 pacas de mercancía → Ver» · Dashboard: «POR ENTREGAR — 19 pacas faltando a 5 clientes»
- Hoja de Excel: «FALTANTES(BODEGA)» — columnas CLIENTE, CIUDAD, CELULAR, REFERENCIA, CALIDAD, PIDIO, RECIBIO, FALTA, PRECIO, VALOR, DESDE, DIAS, REPARTOS
- Aviso de reparto ya cerrado: «Este reparto ya se cerró. Recarga la pantalla.»
- Borrador recuperado: «Tienes una matriz a medias del 09/09 a las 3:12 p. m.» + «Seguir» / «Empezar de cero»

## Plan de entrega

### ENTREGA A — «QUE ME DEJE PEDIR DE MÁS» (≈2 días, CERO backend)

ENTREGA A — «QUE ME DEJE PEDIR DE MÁS» (≈2 días, CERO backend). Se invierte la semántica en los SEIS sitios enumerados (impedimento, el sufijo «· sin stock», el fondo del tbody, el fondo del <tr>, el campo(excede) de los dos selects, el chip semáforo), el banner rojo se vuelve franja ámbar, el botón pasa a «Repartir lo que hay» (que de momento no lleva a ninguna parte: se queda como «Crear N cotización(es)» hasta la entrega B) y —lo más importante— el <select> de Referencia se abre a lo que no tiene existencias con el segundo <optgroup>. Además, borrador en localStorage con clave por usuario, debounce de 1s, el Set de confirmados serializado como arreglo y guardado también en beforeunload. ÚTIL SOLA: hoy la pantalla le GRITA en rojo y le apaga el botón por hacer lo normal, y ni siquiera la deja capturar el pedido de algo que se acabó, que es el caso que motivó todo el encargo. Esta entrega sola le devuelve el uso de la pantalla. Riesgo BAJO: son ediciones quirúrgicas, ningún archivo se parte.

### ENTREGA B — «EL REPARTO» (≈5 días, CERO backend todavía)

ENTREGA B — «EL REPARTO» (≈5 días, CERO backend todavía). Se parte SeparacionMasiva.jsx en orquestador (~300 líneas: carga, cargarStock, refs, filas, reparto, fase) + client/src/pages/matriz/FasePedidos.jsx (movimiento LITERAL de FilaCliente y la tabla, sin «aprovechar para limpiar» nada) + FaseDistribucion.jsx + GrupoProducto.jsx + CintaClientes.jsx, más client/src/lib/matriz.js con las funciones puras (aProrrata, porOrden, cubrirFaltante, reconciliarReparto, proyectarFilas, totalesDeReparto) y tests/matriz-reparto.test.js. El guardado sigue yendo por el POST /cotizaciones/masiva que ya existe, mandando la cantidad REPARTIDA y descartando a los clientes en cero. ORDEN OBLIGATORIO DENTRO DE ESTA ENTREGA, en commits separados: primero mover sin cambiar NADA y comprobar con el Profiler que teclear en una fila sigue sin repintar las demás; solo después añadir la Fase 2. Es la única forma de que una regresión de rendimiento sea atribuible, y el riesgo silencioso número uno de todo el proyecto es precisamente que una prop deje de ser estable al partir el archivo. ÚTIL SOLA: ya puede hacer el reparto entero dentro de la app en vez de en Excel, con la aritmética a la vista y la cinta de clientes. Lo único que falta es la memoria. Riesgo MEDIO-ALTO, concentrado en el split.

### ENTREGA C — «LA MEMORIA» (≈4 días, con backend)

ENTREGA C — «LA MEMORIA» (≈4 días, con backend). Las tres tablas en migracionesIndividuales + src/db/migrations/007_matriz_faltantes.js documental + 'matriz_repartos' en el Set TABLAS de consecutivo.js + el parser de 2mb antes de la línea 45. El refactor de cotizaciones.js extrayendo separarParaClientes y exportando crearCotizacionEnTx (con `node tests/separacion-masiva.test.js` corriendo ANTES y DESPUÉS). src/routes/matriz.js con los endpoints 1 a 8. En el frontend: GET /faltantes como sexta promesa del allSettled, faltantesRef con identidad estable, el chip-botón en infoCliente, el contador-filtro de la barra, las columnas LE FALTABA y el criterio «Cubrir lo que faltó» en la Fase 2, y el guardado que pasa de /masiva a /matriz/repartos/:id/repartir. El borrador de localStorage se sustituye por el autoguardado por cliente contra el servidor. ÚTIL SOLA: cierra el círculo del encargo — «que quede ahí el estado para la próxima poder distribuírselo bien». Riesgo BAJO en la parte aditiva (tablas y GET) y MEDIO en el refactor de cotizaciones.js, que es la ruta más caliente del sistema.

### ENTREGA D — «EL SEGUIMIENTO» (≈3 días)

ENTREGA D — «EL SEGUIMIENTO» (≈3 días). La pantalla /faltantes con sus dos vistas, sus cuatro KPIs, sus filtros, los tres vacíos y el error que no es un vacío; los endpoints 9 a 12 (completar, anular, listar repartos, ver un reparto); los cuatro archivos de registro (App.jsx, Sidebar.jsx, Layout.jsx ROUTE_NAMES —incluido el '/separacion-masiva' que falta desde siempre— y api.js); la hoja FALTANTES(BODEGA) en entregables.js registrada en hojasSel y en los checkboxes de Entregables.jsx; la línea en Clientes.jsx con su petición agregada; el enlace en el detalle de Cartera.jsx; y el tile del Dashboard. ÚTIL SOLA: es la pantalla que ella pidió textualmente («alguna pantalla extra en el panel de visualización para ver qué se entregó, cuánto faltó por entregar a cada cliente»), y es lo que le permite contestar el teléfono cuando el cliente llama a preguntar. Riesgo BAJO: es aditivo y no toca nada de lo que ya funciona.

### REGLA QUE ATRAVIESA LAS CUATRO: al terminar cada entrega hay que reverificar las anclas de línea del dossier, porque partir un archivo de 1459 líneas mueve todos los números

REGLA QUE ATRAVIESA LAS CUATRO: al terminar cada entrega hay que reverificar las anclas de línea del dossier, porque partir un archivo de 1459 líneas mueve todos los números. Y limpiarTodo() tiene que crecer con cada entrega: hoy solo limpia filas, problemas y cacheAvisos; con la B tiene que limpiar `reparto` y volver `fase` a 'pedidos' (o tras guardar se queda en la Fase 2 con la tabla vacía), y con la C tiene que refrescar `faltantes` (que acaban de cambiar porque se acaban de escribir) y limpiar cacheFaltantes, que si no se le pasa la limpieza al componente hijo deja de vaciarse nunca y la fuga que hoy es pequeña se vuelve permanente.

## De dónde salió cada pieza

- DE «LA HOJA» (fiel-al-excel) — LA CINTA DE CLIENTES. Su Excel tiene los totales por cliente en la fila 2 (M2=2, N2=5, O2=4) y ella los usa. Ninguna de las cuatro propuestas ganadoras los tenía, y tres de las cuatro fueron reventadas por el mismo hueco: repartir producto por producto sin ver nunca a un cliente completo. Injerto la fila 2 como cinta pegajosa de tarjetas en la Fase 2. Es la corrección más cara y la más necesaria.
- DE «LA HOJA» — EL SUFIJO /8 DENTRO DE LA CELDA. «[ 5]/8» se lee «le doy 5 de las 8 que pidió» sin mirar a ningún otro sitio. Es la mejor microidea del lote y no cuesta un píxel de columna.
- DE «LA HOJA» — DISTINGUIR «libre 6» ÁMBAR (sobra y alguien lo pidió) DE «libre 20» GRIS (sobra porque nadie más lo quiere). Sin esa distinción, una ronda de 18 productos dispara quince avisos falsos y ella aprende a ignorar el ámbar justo cuando el ámbar es la señal nueva.
- DE «LA HOJA» — input type=text con inputMode=numeric en vez de type=number, con el motivo escrito: la rueda del ratón cambia el valor al hacer scroll y en una tabla larga eso es un bug garantizado que además se descubre tarde.
- DE «LA HOJA» — EL AVISO DE RECONCILIACIÓN. «Reajusté el reparto de 2 productos porque cambió lo disponible.» Nunca cambiar un número a la callada es lo que hace que ella confíe en la pantalla.
- DE «LA MATRIZ GIRADA» (una-sola-tabla) — LA CORRESPONDENCIA COLUMNA A COLUMNA entre las dos fases (Cliente→Producto en el rowSpan, Referencia→Cliente, Cant.→Le doy). Aprendizaje gratis: el ojo ya sabe dónde mirar.
- DE «LA MATRIZ GIRADA» — NO PLEGAR. La propuesta ganadora plegaba 77 de 80 productos y su propio autor admitía que choca con la frase literal de la dueña. Le quito el plegado: los que alcanzan se muestran, uno por línea, con su cuenta. Es «todo a la vista» sin ser 400 filas de detalle.
- DE «LA MATRIZ GIRADA» — EL CHIP SEMÁFORO CAMBIA DE COLOR Y DE PALABRA SIN MOVERSE DE SITIO: bg-error/15 «Faltan 10» pasa a bg-warning/15 «hay 10 · piden 20». El cambio de regla más profundo del encargo comunicado sin una línea de ayuda y sin mover un píxel.
- DE «EL MOSTRADOR» (maestro-detalle) — LA COLUMNA «LE FALTABA» CON FECHA VISIBLE, no escondida en un title. Es el dato que convierte el registro de faltantes en una decisión en el momento en que se toma, en vez de un archivo que nadie abre.
- DE «EL MOSTRADOR» — EL CRITERIO «CUBRIR LO QUE FALTÓ» como botón de reparto por producto. Sin él, guardar faltantes es decorativo: es el único criterio que hace que la memoria sirva para repartir mejor, que es la frase literal del encargo.
- DE «EL MOSTRADOR» — LO QUE ALCANZA SE REPARTE SOLO Y LO ESCASO LLEGA EN CERO, sin sugerencia. Ella dijo «a dedo» sobre lo que no alcanza; devolverle también lo que sí alcanza es trabajo inventado, y precargarle un número en lo escaso la obliga a desmentir cifras que no puso.
- DE «EL MOSTRADOR» — DOS TEXTOS DISTINTOS PARA LOS DOS TOPES: «Pidió 5, no puedo darle más» frente a «Solo quedan 4 sin repartir». Son dos errores distintos y decir «no puedes» sin decir por qué es la peor forma de bloquear.
- DEL TRABAJO DE MODELO — EL LIBRO CONSOLIDADO: una sola fila abierta por cliente+referencia+calidad, con el invariante cantidad_original = saldada + anulada + abierta y el contador veces_aplazado. Es lo que hace que el chip diga la verdad en la ronda 4 en vez de contar la misma paca tres veces, que es el fallo que las tres lentes del jurado marcaron como mortal en las cuatro propuestas.
- DEL TRABAJO DE MODELO — EL PRECIO SE SALDA AL DE HOY, con botón de un clic para respetar el de la ronda vieja SOLO cuando hoy está más caro (ofrecerlo al revés sería ofrecer cobrar de más). Y precio_unitario_origen no se actualiza nunca: manda la promesa más vieja.
- DEL TRABAJO DE VISIBILIDAD — EL CHIP PEGADO A LA LÍNEA DE LA CIUDAD, no como cuarta línea. El caso mayoritario es un cliente sin ítems que hoy ocupa UNA fila; una línea más por cliente devuelve la lista al tamaño que ella rechazó. Y va PRIMERO en el párrafo porque hay truncate y es lo único sin otro refuerzo en la fila.
- DEL TRABAJO DE VISIBILIDAD — LOS DOS MARCADORES EXCLUYENTES EN LA FASE 2: «debíamos 3» (faltante vivo que NO entró en este pedido) frente a «3 de antes» (faltante que ella ya cargó). Con un solo marcador el mismo número se lee dos veces y reparte de más.
- DEL TRABAJO DE VISIBILIDAD — EL CHIP ES UN <button> QUE CARGA LAS LÍNEAS, idempotente, sumando sobre la línea que ya exista en vez de crear una segunda (dos líneas del mismo producto para el mismo cliente producirían dos celdas en la Fase 2). Y la decisión de NO precargar automáticamente: precargar fabrica demanda que el cliente puede que ya no quiera.
- DEL TRABAJO DE VISIBILIDAD — NO HAY CONTADOR EN EL SIDEBAR (exige tocar dashboardApi.getMetricas, contadores.js y el vaciado de sesión para un número que no cambia en todo el día) y SÍ una línea en Clientes.jsx con UNA sola petición agregada. Y en Cartera SOLO un enlace en el detalle, nunca una columna ni un total: ahí todo es plata.
- DEL TRABAJO DE VOCABULARIO — «Repartir lo que hay» en vez de «Pedidos terminados». Todos los botones de esta app son acciones en imperativo; «terminados» se lee como «ya se entregaron», que es lo contrario de lo que pasa; y un botón que no dice a dónde lleva da miedo de oprimir en un flujo de dos fases.
- DEL TRABAJO DE VOCABULARIO — MISMA PALABRA EN PANTALLA, CÓDIGO Y BD, sin capa de traducción. Tener «faltante» arriba y cantidad_pendiente abajo es exactamente como nacen los bugs de dos vocabularios.
- DE LA LENTE DE RIESGO SOBRE LA PROPUESTA GANADORA — LA PROYECCIÓN DE FILAS. En vez de escribir una segunda aritmética (totalesDeRonda) al lado de totalesFila, se construye una copia de `filas` con cantidad = asignada y se pasa por la totalesFila de siempre. Quince líneas en vez de una segunda matemática, y evita repetir el bug de dinero que el propio cotizacion.js documenta.

## Suposiciones que quedan escritas

- LA FASE 2 SIGUE PRODUCIENDO COTIZACIONES. Nadie lo confirmó. Se asume que sí porque es lo que existe, lo que funciona y lo que ella ya usa. Si esperaba otro artefacto (una orden de bodega, un despacho directo), la pantalla sobrevive casi igual pero src/routes/matriz.js cambia entero.
- EL FALTANTE ES ESTRICTAMENTE INTERNO EN LA v1. Los endpoints piden requiereRol('admin','vendedor') y ninguno se expone bajo autentificarCliente, así que un token del portal recibe 403. Cuatro razones: escrito en su cuenta deja de ser una nota y se vuelve una promesa contractual de entregar mercancía que viene de contenedores cuyas referencias ella no controla; la línea guarda el precio viejo, así que el cliente vería «7 × $1.700.000» y al llegar mercancía a $1.900.000 ella hereda una discusión que nunca aceptó; durante las primeras rondas los números van a estar mal y un número malo mostrado al cliente cuesta muchísimo más; y el propósito literal del encargo es «para la próxima poder distribuírselo bien», o sea repartir con criterio y discreción — si cada cliente ve lo que se le debe, el reparto deja de ser discrecional. PERO la columna visible_cliente nace en false desde el día uno: cuesta una columna hoy y evita migrar mañana una tabla con historia.
- EL FALTANTE NO CADUCA POR RELOJ. Cero trabajos automáticos. El precedente del repo es demoledor: reservas.fecha_expiracion + PUT /reservas/expirar es un módulo legacy que nadie usa, y borrar a las tres de la mañana justo lo que ella pidió recordar es lo contrario del encargo. En su lugar envejece a la vista: veces_aplazado y dias_abierto viajan en la consulta, el chip gana un triángulo a los 3 repartos, y hay una franja de escalada en /faltantes.
- UNA SOLA RONDA ABIERTA EN TODO EL SISTEMA. Dos rondas leerían y repartirían el mismo stock, y el todo-o-nada rechazaría la segunda AL FINAL, después de una hora de trabajo. Si una segunda usuaria abre la Matriz, entra a LA MISMA ronda y ve arriba «Reparto MAT-10-09-2026-0004 · lo abrió Jose a las 9:14».
- EL PRECIO POR DEFECTO AL SALDAR ES EL DE HOY, con botón de un clic para respetar el de la ronda vieja SOLO cuando hoy está más caro. Nunca hubo venta: no hubo cotización, no se separó ninguna paca, no se firmó nada; congelar un precio a plazo indefinido crea una obligación abierta sobre mercancía cuyo costo se desconoce (cada contenedor trae su costo_base y honrar 1.700.000 sobre una paca que llegó costando más es vender a pérdida sin que nada avise, porque precio_minimo hoy no se valida en ningún punto de venta). Y al revés, si entró en promoción a menos, cobrarle el viejo es indefendible frente a un cliente que ve la lista de promociones.
- precio_unitario_origen NO SE ACTUALIZA cuando el faltante crece a otro precio: manda la promesa MÁS VIEJA. Una columna, un significado.
- LO REPARTIDO ABONA PRIMERO LO QUE ELLA CARGÓ AL PEDIDO CON EL BOTÓN, y el faltante que NO cargó no se abona solo. Es la regla predecible: en una pantalla donde trabaja rápido, «predecible» le gana a «listo». Si asignar de más bajara la deuda en silencio, vería números moverse sin saber por qué.
- SE PARTE SeparacionMasiva.jsx en orquestador + FasePedidos + FaseDistribucion + GrupoProducto + CintaClientes + lib/matriz.js. La recomendación del dossier, asumida, con la mitigación escrita: mover primero sin cambiar nada, medir con el Profiler, y solo después añadir.
- EL BOTÓN DE EXCEL SE QUEDA DONDE ESTÁ, en el banner verde. No sube a la Fase 2 por dos motivos verificados: hojaMatrizClientes se arma con lo GUARDADO en el servidor (bajado antes de crear, las columnas de cliente saldrían vacías) y /pacas/inventario agrupa SIN LOWER mientras la pantalla agrupa con LOWER, así que los dos números no cuadran y ponerlos a un clic de distancia invita a compararlos.
- EL UMBRAL DE «POCAS PACAS PARA EL FLETE» ES 3. Es un número inventado. Se pone como constante a nivel de módulo con comentario para que se cambie en un sitio en cuanto ella diga el suyo.
- EL BOTÓN DICE «Repartir lo que hay» Y NO «Pedidos terminados», que es lo que ella dijo. Se cambia una constante si al verlo prefiere su frase.
- EL BORRADOR VIVE EN localStorage EN LAS ENTREGAS A Y B, y pasa al servidor con autoguardado por cliente en la C. localStorage no es fiable en su entorno (el propio repo documenta que lanza SecurityError con cookies bloqueadas, por eso ThemeContext está entero en try/catch) y es por navegador, pero en las dos primeras entregas es lo único que no cuesta backend, y el 401 que redirige a /login se lleva una hora de tecleo sin avisar.
- LOS DETALLES DE LA COTIZACIÓN SIGUEN SIN MANDAR `clasificacion`. Es lo que hace que reservarPacas empareje solo por referencia+calidad, la misma clave del reparto de la pantalla. Se deja escrito en el comentario del código nuevo para que nadie lo «mejore».
- LA COLUMNA cotizacion_detalles.tipo SEGUIRÁ GUARDANDO LA REFERENCIA en todas las filas nacidas de la Matriz, como hoy. No se arregla aquí: cambiarlo movería el significado de la columna a mitad del histórico sin que nada falle visiblemente.
- EL DIFF SIN COMMITEAR DE src/routes/pacas.js Y EL Contenedores.jsx SUELTO EN LA RAÍZ DEL BACKEND NO SE TOCAN, pero conviene resolverlos ANTES de empezar para no mezclar. El diff cambia el significado de la palabra «costo» en el inventario y en el Excel MATRIZ, y aplica un NULLIF sobre un PROMEDIO que en grupos mixtos devuelve valores diluidos sin sentido.
