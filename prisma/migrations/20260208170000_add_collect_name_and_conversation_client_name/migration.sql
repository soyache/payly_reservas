-- Add optional client name to conversations
ALTER TABLE "conversations"
ADD COLUMN IF NOT EXISTS "client_name" TEXT;

-- Add collect_name step to conversation state machine enum
ALTER TYPE "ConversationStep"
ADD VALUE IF NOT EXISTS 'collect_name' BEFORE 'greeting';
