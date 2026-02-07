# 📋 Plan de Proyecto v2: Sistema de Citas por WhatsApp para Barberías y Pequeños Negocios

## Visión General

Sistema multi-tenant de agendamiento de citas a través de WhatsApp, donde el cliente final interactúa únicamente por WhatsApp y la empresa gestiona sus citas desde un panel web (PWA). El sistema maneja el flujo completo: selección de fecha → horario → reserva → envío de comprobante de pago → aprobación por la empresa → confirmación al cliente.

Se utiliza la **API oficial de WhatsApp Cloud (Meta)** para garantizar estabilidad, cero riesgo de baneo, y acceso a funciones avanzadas como botones interactivos y listas.

### Decisiones cerradas (07 Feb 2026)
- La API estará expuesta a internet desde Fase 1.
- Base de datos de producción: **PostgreSQL administrado en DigitalOcean** desde el inicio.
- Comprobantes de pago: retención de **90 días**.
- Antes del borrado: envío automático de **reporte de comprobantes por vencer** al negocio.
- Se implementa idempotencia + reintentos controlados para webhooks y envíos a Meta.

---

## Stack Tecnológico

| Componente | Tecnología | Justificación |
|---|---|---|
| WhatsApp | **WhatsApp Cloud API (Meta oficial)** | Cero riesgo de baneo, botones interactivos, listas, templates, badge verificado |
| Backend | Node.js + TypeScript + Express | Ecosistema maduro, webhooks nativos, async nativo |
| Base de datos | PostgreSQL (DigitalOcean Managed DB) | Mejor concurrencia desde el día 1, menor riesgo operativo, listo para escalar multi-tenant |
| ORM | Prisma | Type-safe, migraciones automáticas, compatible SQLite y PostgreSQL |
| Panel empresa | React (PWA) | Funciona en celular y PC, sin necesidad de app stores |
| Hosting | DigitalOcean Droplet $6/mes | 1GB RAM, 1vCPU, 25GB SSD, 1TB transferencia |
| Almacenamiento imágenes | Sistema de archivos local con política de retención (inicio) → Spaces/S3/R2 (escala) | Comprobantes de pago con ciclo de vida |
| SSL/HTTPS | Let's Encrypt + Nginx | Requerido por Meta para webhooks |
| Dominio | Requerido (.com ~$10/año) | Necesario para webhook HTTPS público |

---

## Estructura de Cuentas en Meta (Multi-Tenant)

```
TU META BUSINESS MANAGER (1 cuenta, la tuya como plataforma)
│
├── Meta Developer App ("CitasBot")
│   ├── WhatsApp Product (configurado)
│   └── Webhook URL: https://tudominio.com/webhook/whatsapp
│
├── WABA 1 → Barbería Juan
│   └── Phone Number ID: xxxx (número +504...)
│
├── WABA 2 → Barbería Pedro
│   └── Phone Number ID: yyyy (número +504...)
│
├── WABA 3 → Salón María
│   └── Phone Number ID: zzzz (número +504...)
│
└── ... hasta 20 WABAs (expandible por solicitud)
```

### Datos clave de la estructura Meta:
- **1 Business Manager** puede tener hasta **20 WABAs** (expandible)
- Cada **WABA** puede tener hasta **25 números de teléfono**
- Cada WABA representa idealmente **un negocio diferente**
- Todos los WABAs se gestionan desde **tu mismo Facebook/Meta**
- **No necesitás BSP (Business Solution Provider)**: accedés directo a la Cloud API de Meta como desarrollador
- Los números registrados en la API **no pueden usarse** en WhatsApp normal o WhatsApp Business App simultáneamente

---

## Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────────┐
│                     SERVIDOR ($6/mes)                         │
│                                                               │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  Webhook        │  │  API REST    │  │  React PWA       │ │
│  │  /webhook/wa    │  │  (Express)   │  │  (Panel Admin)   │ │
│  │                 │  │              │  │                   │ │
│  │  Recibe msgs    │  │  /api/citas  │  │  /admin           │ │
│  │  de Meta para   │  │  /api/config │  │  /admin/login     │ │
│  │  TODOS los      │  │  /api/pagos  │  │                   │ │
│  │  negocios       │  │  /api/waba   │  │                   │ │
│  └───────┬─────────┘  └──────┬───────┘  └──────────────────┘ │
│          │                    │                                │
│          ▼                    ▼                                │
│  ┌────────────────────────────────────┐                      │
│  │        Lógica de Negocio           │                      │
│  │  ┌──────────┐  ┌───────────────┐  │                      │
│  │  │ Máquina  │  │ Meta Graph    │  │                      │
│  │  │ de       │  │ API Client    │  │                      │
│  │  │ Estados  │  │ (enviar msgs) │  │                      │
│  │  └──────────┘  └───────────────┘  │                      │
│  └──────────────────┬─────────────────┘                      │
│                     │                                         │
│              ┌──────┴──────┐                                 │
│              │   SQLite/   │                                  │
│              │  PostgreSQL │                                  │
│              └─────────────┘                                  │
└──────────────────────────────────────────────────────────────┘
                     │
                     │ HTTPS (webhook)
                     ▼
        ┌─────────────────────┐
        │  Meta Cloud API     │
        │  (servidores Meta)  │
        │                     │
        │  Barbería1 → msg →  │──── Cliente WhatsApp
        │  Barbería2 → msg →  │──── Cliente WhatsApp
        │  Barbería3 → msg →  │──── Cliente WhatsApp
        └─────────────────────┘
```

### Diferencia clave vs Baileys:
- **Baileys**: Tu servidor mantiene conexiones WebSocket abiertas por cada número (~50MB RAM c/u)
- **Meta Cloud API**: Meta mantiene las conexiones. Tu servidor solo recibe webhooks HTTP y envía respuestas via Graph API. **Consumo de RAM mínimo**, escala mucho mejor.

---

## Cómo Funciona la Comunicación con Meta

### Recibir mensajes (Webhook entrante):
```
Cliente envía "Hola" al +504-xxxx
        │
        ▼
Meta recibe el mensaje
        │
        ▼
Meta envía POST a https://tudominio.com/webhook/whatsapp
con payload JSON que incluye:
  - phone_number_id (identifica qué negocio)
  - from (número del cliente)
  - message body / image / interactive reply
        │
        ▼
Tu servidor procesa y responde
```

### Enviar mensajes (Graph API):
```javascript
// Enviar mensaje de texto
POST https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
Headers: Authorization: Bearer {ACCESS_TOKEN}
Body: {
  "messaging_product": "whatsapp",
  "to": "50499887766",
  "type": "text",
  "text": { "body": "¡Hola! Bienvenido a Barbería Juan..." }
}

// Enviar lista interactiva (horarios)
Body: {
  "messaging_product": "whatsapp",
  "to": "50499887766",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": { "text": "Selecciona un horario disponible:" },
    "action": {
      "button": "Ver horarios",
      "sections": [{
        "title": "Horarios disponibles",
        "rows": [
          { "id": "slot_1", "title": "8:30 - 9:30 AM" },
          { "id": "slot_2", "title": "9:30 - 10:30 AM" },
          { "id": "slot_3", "title": "11:00 - 12:00 PM" }
        ]
      }]
    }
  }
}

// Enviar botones de confirmación
Body: {
  "messaging_product": "whatsapp",
  "to": "50499887766",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "¿Confirmas tu cita para el viernes 7 de febrero a las 9:30 AM?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "confirm_yes", "title": "✅ Sí, confirmar" }},
        { "type": "reply", "reply": { "id": "confirm_no", "title": "❌ No, cambiar" }}
      ]
    }
  }
}
```

---

## Seguridad y Confiabilidad (Obligatorio en Fase 1)

### 1) Webhook seguro (internet público)
- Verificar firma `X-Hub-Signature-256` en **cada POST** usando `META_APP_SECRET`.
- Rechazar payload sin firma válida (`401`) y registrar intento.
- Mantener verificación GET (`hub.challenge`) solo para onboarding inicial.

### 2) Idempotencia de eventos entrantes
- Guardar cada `wamid` (message id) y `change_id` procesado.
- Si llega un webhook repetido, responder `200` y **no reprocesar**.
- Regla: cada transición de estado de cita debe ser idempotente por `business_id + client_phone + message_id`.

### 3) Reintentos de envío saliente (solución concreta)
- Crear cola persistente en DB: `outbound_messages`.
- Estados: `queued | sending | sent | failed | dead_letter`.
- Campos clave: `idempotency_key`, `attempt_count`, `next_retry_at`, `last_error`.
- Política de retry: backoff exponencial con jitter (ej. 15s, 45s, 2m, 6m, 15m; máx 5 intentos).
- Si supera intentos: `dead_letter` + alerta en panel admin.
- Worker con `node-cron` cada minuto para drenar `queued/failed` con `next_retry_at <= now()`.

### 4) Concurrencia de horarios (evitar doble reserva)
- Constraint único al confirmar: `(business_id, date, time_slot_id, status in ['pending_payment','pending_approval','confirmed'])`.
- Transición de `select_time -> pending_payment` en transacción DB.
- Si el slot ya fue tomado, responder con mensaje y recargar lista de horarios.

### 5) Endpoints admin mínimos seguros
- No dejar endpoints sin control aunque sea MVP.
- En Fase 1 usar `X-Admin-Token` por negocio o token global rotado.
- Agregar rate limit básico y logging de auditoría (`approved_by`, `approved_at`, `ip`).

---

## Modelo de Base de Datos (Actualizado para Meta API)

```
businesses (negocios)
├── id
├── name (nombre del negocio)
├── phone_number (número WhatsApp del negocio)
├── timezone (default: America/Tegucigalpa)
├── waba_id (WhatsApp Business Account ID en Meta)
├── phone_number_id (Phone Number ID en Meta — clave para enviar mensajes)
├── owner_name
├── owner_phone (para notificaciones)
├── owner_phone_number_id (si el dueño también usa la API para recibir notificaciones)
├── bank_accounts (JSON: cuentas para depósito)
├── working_days (JSON: días laborales)
├── address (dirección física del negocio)
├── is_active
├── created_at
└── updated_at

services (servicios que ofrece)
├── id
├── business_id → businesses.id
├── name (ej: "Corte clásico", "Barba")
├── duration_minutes (ej: 30, 45, 60)
├── price
└── is_active

time_slots (horarios disponibles)
├── id
├── business_id → businesses.id
├── day_of_week (0-6)
├── start_time (ej: "08:30")
├── end_time (ej: "09:30")
├── max_appointments (cupos por slot)
└── is_active

appointments (citas)
├── id
├── business_id → businesses.id
├── service_id → services.id
├── client_phone
├── client_name
├── date
├── time_slot_id → time_slots.id
├── status (pending_payment | pending_approval | confirmed | cancelled | completed | no_show)
├── payment_proof_url (ruta imagen comprobante)
├── payment_proof_expires_at (created_at + 90 días)
├── payment_proof_reported_at (fecha en que se incluyó en reporte de vencimiento)
├── reminder_24h_sent (boolean)
├── reminder_1h_sent (boolean)
├── created_at
└── updated_at

conversations (estado de la conversación activa)
├── id
├── business_id → businesses.id
├── client_phone
├── client_phone_e164 (normalizado)
├── current_step (greeting | select_service | select_date | confirm_date | select_time | confirm_time | awaiting_payment | awaiting_approval | completed)
├── temp_data (JSON: datos parciales de la cita en progreso)
├── last_message_at
├── service_window_expires_at (para saber si estamos dentro de las 24h gratuitas)
└── created_at

message_templates (templates aprobados por Meta)
├── id
├── business_id → businesses.id (o null si es global)
├── template_name (nombre en Meta, ej: "appointment_reminder")
├── category (utility | marketing)
├── language (es)
├── status (pending | approved | rejected)
└── created_at

processed_webhook_events (idempotencia inbound)
├── id
├── business_id
├── event_key (unique: wamid o hash de change)
├── payload_hash
├── processed_at
└── created_at

outbound_messages (cola persistente de envíos)
├── id
├── business_id
├── appointment_id (nullable)
├── to_phone_e164
├── message_type (text | interactive | template)
├── payload_json
├── idempotency_key (unique)
├── status (queued | sending | sent | failed | dead_letter)
├── attempt_count
├── next_retry_at
├── meta_message_id (nullable)
├── last_error (nullable)
├── sent_at (nullable)
├── created_at
└── updated_at

admin_audit_log (auditoría mínima)
├── id
├── business_id
├── action (approve_appointment | reject_appointment | delete_payment_proof)
├── actor (api_admin)
├── actor_ip
├── target_id
├── metadata_json
└── created_at
```

---

## Flujo de Conversación (Máquina de Estados — Usando Mensajes Interactivos)

```
INICIO (cliente escribe al WhatsApp del negocio)
  │
  ▼
[greeting] → Mensaje de texto:
  "¡Hola! 👋 Bienvenido a {nombre_negocio}."
  + Botones interactivos:
    [📅 Agendar cita]  [ℹ️ Info / Horarios]
  │
  ▼ (cliente toca "Agendar cita")
[select_service] → Lista interactiva:
  "¿Qué servicio te interesa?"
  ┌─────────────────────────┐
  │ 💇 Corte clásico - L.150│
  │ 💇 Corte + barba - L.200│
  │ ✂️ Solo barba - L.100   │
  └─────────────────────────┘
  │
  ▼ (cliente selecciona de la lista)
[select_date] → Lista interactiva:
  "¿Para qué día?"
  ┌──────────────────────────┐
  │ Hoy - Jueves 6 feb       │
  │ Mañana - Viernes 7 feb   │
  │ Sábado 8 feb              │
  │ Lunes 10 feb              │
  │ Martes 11 feb             │
  └──────────────────────────┘
  │
  ▼ (cliente selecciona)
[select_time] → Lista interactiva:
  "Horarios disponibles para el viernes 7 feb:"
  ┌──────────────────────────┐
  │ 8:30 AM - 9:30 AM  ✅    │
  │ 9:30 AM - 10:30 AM ✅    │
  │ 11:00 AM - 12:00 PM ✅   │
  └──────────────────────────┘
  │
  ▼ (cliente selecciona)
[confirm_booking] → Texto + Botones:
  "📋 Resumen de tu cita:
   ✂️ Servicio: Corte clásico
   📅 Fecha: Viernes 7 de febrero
   🕐 Hora: 9:30 AM - 10:30 AM
   💰 Precio: L.150"
  + Botones:
    [✅ Confirmar]  [🔄 Cambiar]  [❌ Cancelar]
  │
  ▼ (cliente toca "Confirmar")
[awaiting_payment] → Texto:
  "¡Tu cupo está reservado! 🎉

   Para confirmar, deposita L.150 a:
   🏦 Banco Atlántida: 1234-5678-90
   🏦 BAC: 0987-6543-21
   A nombre de: Juan Pérez

   📸 Envía tu comprobante de pago aquí."
  │
  ▼ (cliente envía imagen del comprobante)
[awaiting_approval] → Texto:
  "✅ Recibimos tu comprobante.
   Estamos verificando el pago.
   Te confirmaremos pronto. ⏳"
  │
  │ → (notificación al dueño vía panel web + opcionalmente WhatsApp)
  │
  ▼ (dueño aprueba desde el panel)
[completed] → Texto (Template de Utility si pasaron +24h):
  "🎉 ¡Cita confirmada!
   ✂️ Corte clásico
   📅 Viernes 7 de febrero
   🕐 9:30 AM
   📍 {dirección del negocio}

   ¡Te esperamos!"
```

### Ventaja de los mensajes interactivos:
- El cliente **toca** en lugar de escribir → menos errores
- Las listas soportan hasta **10 opciones** (perfecto para horarios)
- Los botones soportan hasta **3 opciones** (perfecto para confirmar/cancelar)
- La experiencia es más profesional y rápida

---

## Precios WhatsApp Cloud API para Honduras (Rest of Latin America)

### Tarifas por mensaje (vigentes enero 2026, USD):

| Tipo de mensaje | Precio/msg | ¿Cuándo se usa? |
|---|---|---|
| **Service (cliente inicia)** | **$0.00 GRATIS** | Todo el flujo de cita cuando el cliente escribe primero |
| **Utility** | $0.013 | Recordatorios, confirmación de pago si ventana de 24h cerró |
| **Marketing** | $0.085 | Promociones, ofertas (no necesario para citas) |
| **Authentication** | $0.013 | OTPs, verificación (no necesario para citas) |

### Regla de oro que hace esto barato:
- Cuando el **cliente escribe primero**, se abre una ventana de 24 horas
- Dentro de esa ventana, **TODOS tus mensajes son gratis** (texto libre + utility templates)
- La ventana **se reinicia** cada vez que el cliente responde
- En tu flujo de citas, el cliente responde en cada paso → **todo el flujo es gratis**
- Solo pagás por mensajes **fuera** de la ventana (recordatorios, confirmaciones tardías)

### Costo estimado por barbería (150 citas/mes):

| Concepto | Mensajes | Costo |
|---|---|---|
| Flujo completo de cita (cliente inicia) | ~150 conversaciones | **$0.00** |
| Confirmación de pago (si +24h después) | ~50 utility msgs | **$0.65** |
| Recordatorio 24h antes | ~150 utility msgs | **$1.95** |
| Recordatorio 1h antes | ~150 utility msgs | **$1.95** |
| **Total por barbería** | | **~$4.55/mes** |

---

## Templates de WhatsApp (Requieren Aprobación de Meta)

Para enviar mensajes **fuera** de la ventana de 24 horas, necesitás templates aprobados.

### Templates necesarios para el sistema:

**1. Recordatorio de cita (Utility)**
```
Nombre: appointment_reminder
Categoría: Utility
Idioma: es
Texto:
"Hola {{1}} 👋
Te recordamos tu cita en {{2}}:
📅 {{3}}
🕐 {{4}}
✂️ {{5}}

¿Asistirás?"
Variables: nombre_cliente, nombre_negocio, fecha, hora, servicio
```

**2. Confirmación de pago (Utility)**
```
Nombre: payment_confirmed
Categoría: Utility
Idioma: es
Texto:
"🎉 ¡Pago verificado!
Tu cita en {{1}} está confirmada:
📅 {{2}} a las {{3}}
📍 {{4}}

¡Te esperamos!"
Variables: nombre_negocio, fecha, hora, dirección
```

**3. Cita cancelada (Utility)**
```
Nombre: appointment_cancelled
Categoría: Utility
Idioma: es
Texto:
"Tu cita en {{1}} del {{2}} a las {{3}} ha sido cancelada.

¿Deseas reagendar? Escríbenos."
Variables: nombre_negocio, fecha, hora
```

---

## Fases de Desarrollo

### FASE 1: Setup de Meta + MVP (Semanas 1-4)
**Objetivo:** Bot funcional con la API oficial de Meta para UN negocio.

- [ ] **1.1 Configuración de cuentas Meta**
  - Crear Meta Business Manager (business.facebook.com)
  - Verificar el negocio en Meta (puede tomar 3-7 días)
  - Crear Developer App en developers.facebook.com
  - Agregar producto WhatsApp a la app
  - Obtener el número de prueba gratuito de Meta (sandbox)
  - Generar System User + Permanent Access Token
  - Enviar primer mensaje de prueba con curl

- [ ] **1.2 Configuración del proyecto**
  - Inicializar proyecto Node.js + TypeScript
  - Configurar Prisma + PostgreSQL (DigitalOcean Managed DB)
  - Estructura de carpetas
  - Configurar ESLint y scripts de desarrollo
  - Configurar Nginx + Let's Encrypt en DigitalOcean (necesario para webhook HTTPS)

- [ ] **1.3 Webhook de WhatsApp**
  - Crear endpoint POST /webhook/whatsapp
  - Implementar verificación GET (hub.challenge) que requiere Meta
  - Validar firma `X-Hub-Signature-256` en todos los POST entrantes
  - Registrar webhook en el dashboard de Meta
  - Suscribirse a eventos: messages, message_status
  - Parsear payloads entrantes (texto, imágenes, respuestas interactivas)
  - Identificar a qué negocio pertenece cada mensaje (vía phone_number_id)
  - Registrar eventos procesados para idempotencia (no duplicar procesamiento)

- [ ] **1.4 Cliente de Graph API (enviar mensajes)**
  - Módulo para enviar mensajes de texto
  - Módulo para enviar listas interactivas
  - Módulo para enviar botones de respuesta rápida
  - Módulo para enviar templates con variables
  - Módulo para descargar media (imágenes de comprobantes)
  - Cola persistente de envíos salientes
  - Manejo de rate limits y reintentos con backoff exponencial + jitter
  - Dead-letter + reintento manual desde panel admin

- [ ] **1.5 Máquina de estados**
  - Implementar flujo completo con mensajes interactivos
  - Manejo de respuestas interactivas (button replies, list replies)
  - Manejo de texto libre como fallback
  - Timeout de conversaciones inactivas (30 min)
  - Guardar/restaurar estado por conversación

- [ ] **1.6 Lógica de citas**
  - Calcular fechas disponibles (próximos 7 días, excluyendo días no laborales)
  - Filtrar horarios ya ocupados
  - Reservar cupo temporalmente al iniciar pago (liberar si no paga en X minutos)
  - Confirmación de slot en transacción para evitar doble reserva
  - Descargar y guardar comprobante de pago (imagen)
  - Asignar expiración de comprobante a 90 días

- [ ] **1.7 Registrar número real del primer negocio**
  - Comprar/usar número dedicado para el negocio
  - Registrar en la WABA
  - Verificar vía SMS/llamada
  - Crear y enviar templates para aprobación de Meta
  - Probar flujo completo con clientes reales

- [ ] **1.8 Seguridad mínima de endpoints administrativos**
  - Proteger endpoints de aprobación/rechazo con `X-Admin-Token`
  - Aplicar rate limiting básico por IP
  - Registrar auditoría de acciones administrativas

---

### FASE 2: Panel Web para la Empresa (Semanas 5-7)
**Objetivo:** Panel donde el dueño gestiona todo visualmente.

- [ ] **2.1 API REST**
  - CRUD de servicios
  - CRUD de horarios
  - Listar citas (filtrar por fecha, estado)
  - Aprobar / rechazar comprobantes (dispara mensaje de confirmación al cliente)
  - Configuración del negocio (cuentas bancarias, mensajes personalizados)
  - Endpoint para ver imagen del comprobante

- [ ] **2.2 Autenticación del panel**
  - Login simple (email + contraseña)
  - JWT para sesiones
  - Middleware de autorización
  - Roles: super_admin (tú) y business_admin (dueño del negocio)

- [ ] **2.3 Frontend React (PWA)**
  - Dashboard: citas del día, pendientes de aprobación, ingresos del día
  - Vista de calendario semanal con citas
  - Detalle de cita con imagen del comprobante
  - Botones de aprobar / rechazar con confirmación
  - Configuración: horarios, servicios, precios, cuentas bancarias
  - Notificaciones push (PWA) cuando llega un comprobante nuevo
  - Hacer instalable como PWA (manifest.json, service worker)

---

### FASE 3: Multi-Tenant (Semanas 8-10)
**Objetivo:** Soportar múltiples negocios desde el mismo servidor y Business Manager.

- [ ] **3.1 Gestión de WABAs y números**
  - Onboarding de nuevo negocio:
    1. Crear WABA en Meta Business Manager
    2. Registrar número del negocio
    3. Verificar número
    4. Guardar phone_number_id y waba_id en DB
  - Panel super-admin para gestionar negocios
  - Cada negocio accede solo a SUS datos en el panel

- [ ] **3.2 Router de mensajes multi-tenant**
  - El webhook recibe TODOS los mensajes de todos los negocios
  - Identificar negocio por phone_number_id del payload
  - Enrutar al handler correcto con el business_id correspondiente
  - Token de acceso: uno solo (System User) sirve para todos los WABAs

- [ ] **3.3 Templates por negocio**
  - Crear templates genéricos que sirvan para todos (con variables)
  - O crear templates personalizados por negocio si lo requieren
  - Gestión de estado de aprobación de templates

- [ ] **3.4 Aislamiento de datos**
  - Verificar que todas las queries filtren por business_id
  - Separar carpetas de comprobantes por negocio
  - Subdominio o ruta por negocio en el panel

---

### FASE 4: Mejoras y Pulido (Semanas 11-14)
**Objetivo:** Experiencia profesional y confiable.

- [ ] **4.1 Recordatorios automáticos (Cron Jobs)**
  - Job cada hora: buscar citas de mañana → enviar template reminder 24h
  - Job cada hora: buscar citas en 1h → enviar template reminder 1h
  - Rastrear ventana de servicio: si el cliente respondió recientemente, usar texto libre (gratis); si no, usar template (pagado)
  - Opción de cancelar respondiendo al recordatorio

- [ ] **4.2 Manejo de cancelaciones**
  - Cliente puede cancelar por WhatsApp (botón en el recordatorio)
  - Liberar horario automáticamente
  - Notificar al dueño en el panel
  - Enviar template de cancelación al cliente si necesario

- [ ] **4.3 Reportes básicos**
  - Citas por día/semana/mes
  - Ingresos estimados y reales
  - Tasa de cancelación y no-shows
  - Clientes frecuentes
  - Costo de mensajes WhatsApp (para tu control)

- [ ] **4.4 Mejoras de UX en el bot**
  - Mensajes personalizables por negocio desde el panel
  - Soporte para "volver atrás" en el flujo (botón "🔙 Atrás")
  - Manejo de mensajes fuera de contexto ("No entendí, ¿deseas agendar una cita?")
  - Horario de atención del bot configurable
  - Mensaje de fuera de horario

- [ ] **4.5 Optimización de costos de mensajes**
  - Rastrear service_window_expires_at por conversación
  - Si estamos dentro de la ventana: enviar texto libre (gratis)
  - Si estamos fuera: usar template utility ($0.013)
  - Dashboard para ti: cuántos mensajes pagados se enviaron por negocio/mes

- [ ] **4.6 Retención y cumplimiento de comprobantes**
  - Job diario: detectar comprobantes con vencimiento en 7 días
  - Enviar reporte al negocio (CSV o listado en panel) antes del borrado
  - Borrado automático al día 90 (archivo + metadata)
  - Registrar evento de borrado en auditoría

---

## Estructura de Carpetas del Proyecto

```
whatsapp-citas/
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts                      (punto de entrada)
│   ├── config/
│   │   └── env.ts                    (tokens Meta, secrets, config)
│   │
│   ├── whatsapp/
│   │   ├── webhook.ts                (POST/GET endpoint para Meta)
│   │   ├── webhookParser.ts          (parsear payload de Meta)
│   │   ├── graphApi.ts               (cliente para Graph API de Meta)
│   │   ├── messageBuilder.ts         (construir mensajes: texto, listas, botones)
│   │   ├── templateSender.ts         (enviar template messages)
│   │   └── mediaHandler.ts           (descargar imágenes/media de Meta)
│   │
│   ├── bot/
│   │   ├── router.ts                 (identifica negocio por phone_number_id)
│   │   ├── stateMachine.ts           (máquina de estados principal)
│   │   ├── steps/
│   │   │   ├── greeting.ts
│   │   │   ├── selectService.ts
│   │   │   ├── selectDate.ts
│   │   │   ├── selectTime.ts
│   │   │   ├── confirmBooking.ts
│   │   │   ├── awaitingPayment.ts
│   │   │   └── awaitingApproval.ts
│   │   └── helpers/
│   │       ├── dateUtils.ts
│   │       ├── slotAvailability.ts
│   │       └── serviceWindowTracker.ts (rastrear ventana de 24h gratuita)
│   │
│   ├── api/
│   │   ├── server.ts                 (Express)
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── appointments.ts
│   │   │   ├── services.ts
│   │   │   ├── timeSlots.ts
│   │   │   ├── business.ts
│   │   │   └── superAdmin.ts         (gestión de WABAs y negocios)
│   │   └── middleware/
│   │       ├── auth.ts
│   │       └── roleGuard.ts          (super_admin vs business_admin)
│   │
│   ├── jobs/
│   │   ├── reminderJob.ts            (cron: enviar recordatorios)
│   │   ├── expireReservations.ts     (cron: liberar cupos no pagados)
│   │   └── scheduler.ts              (configurar node-cron)
│   │
│   ├── services/
│   │   ├── appointmentService.ts
│   │   ├── businessService.ts
│   │   ├── notificationService.ts
│   │   └── messageCostTracker.ts     (rastrear costos de mensajes)
│   │
│   └── database/
│       └── prisma.ts                 (cliente Prisma singleton)
│
├── panel/                            (React PWA - puede ser repo separado)
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Calendar.tsx
│   │   │   ├── Appointments.tsx
│   │   │   ├── Settings.tsx
│   │   │   ├── Login.tsx
│   │   │   └── SuperAdmin.tsx        (solo para ti)
│   │   ├── components/
│   │   │   ├── AppointmentCard.tsx
│   │   │   ├── PaymentProofViewer.tsx
│   │   │   ├── ApproveRejectButtons.tsx
│   │   │   └── WeekCalendar.tsx
│   │   └── services/
│   │       └── api.ts
│   └── public/
│       └── manifest.json
│
├── uploads/                          (comprobantes de pago)
│   └── {business_id}/
│       └── {appointment_id}.jpg
│
├── nginx/
│   └── sites-available/              (configuración Nginx para HTTPS)
│
└── README.md
```

---

## Costos Proyectados (Con API Oficial de Meta)

### Costos fijos:

| Concepto | 1-10 negocios | 10-20 negocios | 20-50 negocios |
|---|---|---|---|
| DigitalOcean Droplet | $6/mes | $12/mes | $24/mes |
| Dominio (.com) | ~$0.83/mes | ~$0.83/mes | ~$0.83/mes |
| SSL (Let's Encrypt) | $0 | $0 | $0 |
| API WhatsApp (acceso) | $0 | $0 | $0 |

### Costos variables (mensajes WhatsApp por negocio):

| Concepto | Msgs/mes | Costo/negocio |
|---|---|---|
| Flujo de citas (cliente inicia → gratis) | ~150 | $0.00 |
| Confirmaciones tardías (utility) | ~50 | $0.65 |
| Recordatorios 24h (utility template) | ~150 | $1.95 |
| Recordatorios 1h (utility template) | ~150 | $1.95 |
| **Subtotal por negocio** | | **~$4.55/mes** |

### Costo total estimado:

| Escenario | Hosting | Mensajes | Total |
|---|---|---|---|
| 1 negocio (validar) | $6 | ~$4.55 | **~$10.55/mes** |
| 5 negocios | $6 | ~$22.75 | **~$28.75/mes** |
| 10 negocios | $6 | ~$45.50 | **~$51.50/mes** |
| 20 negocios | $12 | ~$91.00 | **~$103/mes** |
| 50 negocios | $24 | ~$227.50 | **~$251.50/mes** |

**Primeros 2 meses de hosting:** $0 (crédito de $200 de DigitalOcean para cuentas nuevas)

---

## Modelo de Negocio Sugerido

| Plan | Precio mensual sugerido | Incluye | Tu costo real |
|---|---|---|---|
| Básico | L. 400-600/mes (~$16-24 USD) | Bot + Panel + hasta 100 citas | ~$4.55 |
| Profesional | L. 700-1000/mes (~$28-40 USD) | + Múltiples servicios + recordatorios + reportes | ~$4.55 |
| Premium | L. 1000-1500/mes (~$40-60 USD) | + Personalización + soporte prioritario | ~$4.55 |

### Proyección de ingresos:

| Negocios | Ingreso mensual (plan básico) | Costo total | Ganancia | Margen |
|---|---|---|---|---|
| 5 | ~$100 | ~$29 | **~$71** | 71% |
| 10 | ~$200 | ~$52 | **~$148** | 74% |
| 20 | ~$400 | ~$103 | **~$297** | 74% |
| 50 | ~$1,000 | ~$252 | **~$748** | 75% |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| ~~WhatsApp banea el número~~ | ~~Media~~ | ~~Alto~~ | ✅ **Eliminado**: API oficial no tiene riesgo de baneo |
| Verificación de Meta tarda | Media | Medio | Iniciar proceso de verificación lo antes posible, tener docs listos |
| Template rechazado por Meta | Baja | Medio | Seguir guías de Meta, usar lenguaje neutro, no spam |
| El servidor se cae | Baja | Alto | Backups automáticos ($1.20/mes), monitoreo, auto-restart con PM2 |
| Cliente no entiende el bot | Baja | Medio | Botones y listas interactivas reducen errores, mensaje de ayuda |
| Comprobante falso | Media | Medio | Siempre revisión humana, historial de cliente |
| Meta cambia precios | Baja | Bajo | Márgenes amplios absorben cambios, ajustar precios a clientes |

---

## Requisitos Previos para Empezar

### Documentos y cuentas necesarias:
1. ✅ Cuenta personal de Facebook
2. ✅ Meta Business Manager verificado (business.facebook.com)
3. ✅ Cuenta de Meta Developers (developers.facebook.com)
4. ✅ Documentación legal del negocio (para verificación de Meta)
5. ✅ Cuenta de DigitalOcean
6. ✅ Dominio comprado (para webhook HTTPS)
7. ✅ Número(s) de teléfono dedicado(s) para los negocios

### Herramientas de desarrollo:
- Node.js 18+ y npm
- Git
- VS Code o editor preferido
- Postman (para probar Graph API)
- Meta Developer Dashboard

---

## Próximos Pasos Inmediatos (estado actual)

1. **Crear repositorio base del backend** → TypeScript + Express + Prisma.
2. **Levantar PostgreSQL administrado en DigitalOcean** y configurar `DATABASE_URL` de producción.
3. **Implementar webhook seguro** (`GET` verify + `POST` con firma `X-Hub-Signature-256`).
4. **Construir parser + router multi-tenant por `phone_number_id`**.
5. **Implementar máquina de estados del flujo MVP** (greeting → pago → aprobación).
6. **Crear cola de envíos salientes** con idempotencia y reintentos.
7. **Configurar endpoint admin temporal protegido por `X-Admin-Token`**.
8. **Ejecutar pruebas end-to-end con ngrok** y número de prueba.
9. **Configurar dominio, Nginx y SSL** en el droplet.
10. **Cambiar token temporal por token permanente** (System User) antes de producción.

---

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | Feb 2026 | Plan inicial con Baileys (no oficial) |
| **v2.0** | **Feb 2026** | **Migración a WhatsApp Cloud API (Meta oficial). Eliminado riesgo de baneo. Agregados mensajes interactivos (botones, listas). Actualizado modelo de DB. Actualizado flujo de conversación. Desglose de costos de API. Templates de WhatsApp. Requisitos de Meta.** |
| **v2.1** | **07 Feb 2026** | **Ajuste a despliegue público desde Fase 1. PostgreSQL en DO desde inicio. Seguridad webhook con firma. Idempotencia inbound/outbound. Cola de reintentos con backoff + dead-letter. Control de concurrencia para evitar doble reserva. Token admin mínimo. Retención de comprobantes 90 días con reporte previo.** |

---

*Documento creado: Febrero 2026*
*Última actualización: 07 Febrero 2026 (v2.1)*
