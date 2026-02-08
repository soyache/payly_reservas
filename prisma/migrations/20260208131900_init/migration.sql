-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('pending_payment', 'pending_approval', 'confirmed', 'completed', 'cancelled', 'expired', 'no_show');

-- CreateEnum
CREATE TYPE "ConversationStep" AS ENUM ('greeting', 'select_service', 'select_date', 'select_time', 'confirm_booking', 'awaiting_payment', 'awaiting_approval', 'completed');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('utility', 'marketing', 'authentication');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "OutboundMessageType" AS ENUM ('text', 'interactive', 'template');

-- CreateEnum
CREATE TYPE "OutboundMessageStatus" AS ENUM ('queued', 'sending', 'sent', 'failed', 'dead_letter');

-- CreateEnum
CREATE TYPE "AdminAction" AS ENUM ('approve_appointment', 'reject_appointment', 'delete_payment_proof');

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Tegucigalpa',
    "phone_number" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "owner_phone_number_id" TEXT,
    "bank_accounts" JSONB,
    "working_days" JSONB,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_slots" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "max_appointments" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "client_phone" TEXT NOT NULL,
    "client_phone_e164" TEXT NOT NULL,
    "client_name" TEXT,
    "date" DATE NOT NULL,
    "time_slot_id" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "payment_proof_url" TEXT,
    "payment_proof_expires_at" TIMESTAMP(3),
    "payment_proof_reported_at" TIMESTAMP(3),
    "reminder_24h_sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder_1h_sent" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejected_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "client_phone" TEXT NOT NULL,
    "client_phone_e164" TEXT NOT NULL,
    "current_step" "ConversationStep" NOT NULL DEFAULT 'greeting',
    "temp_data" JSONB,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "service_window_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "business_id" TEXT,
    "template_name" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',
    "status" "TemplateStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "payload_hash" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "to_phone_e164" TEXT NOT NULL,
    "message_type" "OutboundMessageType" NOT NULL,
    "payload_json" JSONB NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "OutboundMessageStatus" NOT NULL DEFAULT 'queued',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "meta_message_id" TEXT,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "action" "AdminAction" NOT NULL,
    "actor" TEXT NOT NULL,
    "actor_ip" TEXT,
    "target_id" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_phone_number_id_key" ON "businesses"("phone_number_id");

-- CreateIndex
CREATE INDEX "idx_businesses_is_active" ON "businesses"("is_active");

-- CreateIndex
CREATE INDEX "idx_services_business_active" ON "services"("business_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_time_slots_business_day_active" ON "time_slots"("business_id", "day_of_week", "is_active");

-- CreateIndex
CREATE INDEX "idx_appointments_slot_lookup" ON "appointments"("business_id", "date", "time_slot_id");

-- CreateIndex
CREATE INDEX "idx_appointments_client_e164" ON "appointments"("business_id", "client_phone_e164");

-- CreateIndex
CREATE INDEX "idx_appointments_status" ON "appointments"("business_id", "status");

-- CreateIndex
CREATE INDEX "idx_appointments_expires_at" ON "appointments"("expires_at");

-- CreateIndex
CREATE INDEX "idx_conversations_business_step" ON "conversations"("business_id", "current_step");

-- CreateIndex
CREATE INDEX "idx_conversations_last_message_at" ON "conversations"("last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_conversations_business_client_e164" ON "conversations"("business_id", "client_phone_e164");

-- CreateIndex
CREATE INDEX "idx_message_templates_status" ON "message_templates"("status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_message_templates_scope_name_lang" ON "message_templates"("business_id", "template_name", "language");

-- CreateIndex
CREATE INDEX "idx_processed_events_processed_at" ON "processed_webhook_events"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_processed_events_business_event_key" ON "processed_webhook_events"("business_id", "event_key");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_messages_idempotency_key_key" ON "outbound_messages"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_outbound_status_next_retry" ON "outbound_messages"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "idx_outbound_business_created_at" ON "outbound_messages"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_admin_audit_business_created_at" ON "admin_audit_log"("business_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_admin_audit_action" ON "admin_audit_log"("action");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_webhook_events" ADD CONSTRAINT "processed_webhook_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
