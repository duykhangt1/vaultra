-- payOS becomes the payment gateway (MOCK stays in the enum so historical rows remain valid)
ALTER TABLE `payments` MODIFY COLUMN `provider` ENUM('VNPAY','MOMO','STRIPE','MOCK','PAYOS') NULL;
ALTER TABLE `payment_webhook_events` MODIFY COLUMN `provider` ENUM('VNPAY','MOMO','STRIPE','MOCK','PAYOS') NOT NULL;
ALTER TABLE `reconciliation_batches` MODIFY COLUMN `provider` ENUM('VNPAY','MOMO','STRIPE','MOCK','PAYOS') NOT NULL;
