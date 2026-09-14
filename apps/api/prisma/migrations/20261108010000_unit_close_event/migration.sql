-- remote lock: closing a unit is recorded next to UNIT_OPEN
ALTER TABLE `access_events` MODIFY COLUMN `event` ENUM('GATE_ENTRY','GATE_EXIT','UNIT_OPEN','UNIT_CLOSE','DENIED') NOT NULL;
