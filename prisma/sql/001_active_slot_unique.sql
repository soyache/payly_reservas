-- Prevent double-booking for active appointment states in the same slot/date/business.
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_active_slot
ON appointments (business_id, date, time_slot_id)
WHERE status IN ('pending_payment', 'pending_approval', 'confirmed');
