# Somfy Protect para Gladys

Controle su alarma **Somfy Protect** desde Gladys: actívela, desactívela, vea
lo que indican sus detectores y cámaras, y reaccione a las alarmas en sus
escenas.

Somfy Protect es un servicio **en la nube**: la integración habla con los
servidores de Somfy, exactamente como la app Somfy Protect. Se necesita una
conexión a Internet; Somfy no ofrece acceso local.

## Lo que obtiene

| En Somfy Protect               | En Gladys                                                                   |
| ------------------------------ | --------------------------------------------------------------------------- |
| Cada sitio (sistema de alarma) | Un dispositivo «Somfy Protect _sitio_»: nivel de seguridad + alarma sonando |
| Detector de movimiento         | Movimiento (1 durante 30 s en cada detección), batería, temperatura         |
| IntelliTag                     | Detección (1 durante 30 s), batería, temperatura                            |
| Mando                          | Presencia (1 = en casa), batería                                            |
| Detector de humo               | Humo, batería                                                               |
| Cámara interior, Somfy One     | Imagen de la cámara, interruptor «Cámara activa» (obturador)                |
| Cerradura                      | Cerrojo (1 = cerrado)                                                       |
| Videoportero                   | Timbre                                                                      |
| Sirena, Link, repetidor        | Batería, temperatura, sabotaje, cuando el dispositivo los indica            |

El nivel de seguridad es una lista con tres opciones, que Gladys muestra en
inglés: **Disarmed** (desactivada), **Partial** (parcial) y **Armed** (total).
Cambiarlo en Gladys lo cambia en Somfy Protect.

Cada dispositivo lleva una insignia **Nube**. Pasa a **Inaccesible** cuando la
nube de Somfy no responde, o cuando el Link ha perdido el contacto con el
dispositivo. La insignia del sitio muestra un punto naranja cuando los eventos
en tiempo real están caídos.

## Instalación

La integración requiere **Gladys 5.3.0 o posterior**.

1. En Gladys, abra **Integraciones**, busque **Somfy Protect** e instálela.
2. En la pantalla **Configuración**, introduzca el **correo** y la
   **contraseña** de su cuenta Somfy Protect y guarde.
3. Pulse **Probar la conexión**: se muestran sus sitios y dispositivos.
4. Abra la pestaña **Descubrimiento** y cree los dispositivos que desee.

> Consejo: cree un usuario dedicado en la app Somfy Protect (Ajustes,
> Usuarios) para Gladys. Su propia cuenta sigue siendo privada y puede
> eliminar ese usuario en cualquier momento.

### Ajustes

| Ajuste                              | Por defecto | Función                                                                                       |
| ----------------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| Intervalo de actualización (s)      | 120         | Frecuencia de lectura de baterías, temperaturas y estados (60 a 3600)                         |
| Eventos en tiempo real              | activado    | Alarmas, cambios de nivel y detecciones llegan en un segundo. Necesario para los disparadores |
| Intervalo de capturas de cámara (s) | 0           | Envía una imagen de las cámaras cada N segundos. 0 = solo cuando se pide                      |
| Registros detallados (depuración)   | desactivado | Registra cada petición y evento, para diagnosticar un problema                                |

## Escenas

### Disparadores

- **Alarma Somfy Protect activada**: alarma de intrusión, pánico o incendio.
  Filtre por sitio y tipo. Variables: nombre del sitio, tipo, nombre del
  dispositivo que la detectó.
- **Alarma Somfy Protect terminada**: la alarma se ha detenido.
- **Nivel de seguridad Somfy Protect cambiado**: filtre por el nuevo nivel.

Los estados de los dispositivos (movimiento, presencia, humo, nivel de
seguridad...) también funcionan con el disparador estándar **Estado de un
dispositivo**.

### Acciones

- **Cambiar el nivel de seguridad Somfy Protect**
- **Parar la alarma Somfy Protect**
- **Abrir o cerrar el obturador de una cámara**
- **Tomar una captura con una cámara Somfy Protect**: colóquela antes de la
  acción **Enviar imagen de cámara** para recibir una imagen reciente.

Ejemplo: «cuando se active la alarma, tomar una captura con la cámara del
salón y enviármela».

## Widget del panel

Añada el widget **Alarma Somfy Protect** a un panel. Muestra el nivel de
seguridad, la alarma, los dispositivos inaccesibles o con batería baja, y
botones para activar el sitio.

Los botones **Desactivar** y **Parar alarma** solo aparecen si el ajuste del
widget **Permitir desactivar** está marcado. Déjelo desmarcado en un panel al
alcance de cualquiera (una tableta en la entrada, por ejemplo). Cada botón
pide una confirmación.

## Solución de problemas

- **«Somfy Protect ha rechazado la cuenta»**: compruebe primero el correo y la
  contraseña en la app Somfy Protect.
- **«Somfy Protect limita las peticiones»**: Somfy bloquea las cuentas que
  inician sesión demasiado a menudo. Espere los segundos indicados; la
  integración vuelve a intentarlo sola. Evite guardar la configuración varias
  veces seguidas.
- **Sin eventos en tiempo real**: compruebe que el contenedor puede acceder a
  `websocket.myfox.io` en el puerto 443. Los estados se actualizan igualmente
  según el intervalo elegido.
- **Sin imagen de cámara**: el obturador de la cámara está cerrado o la cámara
  está desconectada.
- Active los **Registros detallados**, reproduzca el problema y lea los
  registros de la integración. Las contraseñas y los tokens nunca aparecen en
  ellos.

## Privacidad y seguridad

- Su contraseña solo se envía a Somfy. Gladys la guarda como secreto.
- La integración guarda un token de renovación de Somfy en su volumen privado
  `/data`, para no volver a iniciar sesión en cada reinicio.
- Esta integración no está hecha ni respaldada por Somfy. Usa los mismos
  servidores que la app Somfy Protect.
