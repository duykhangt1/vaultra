-- counter payments (cash / bank transfer) get their own reconciliation batches
ALTER TABLE `payments` MODIFY COLUMN `provider` ENUM('VNPAY','MOMO','STRIPE','MOCK','PAYOS','CASH') NULL;
ALTER TABLE `payment_webhook_events` MODIFY COLUMN `provider` ENUM('VNPAY','MOMO','STRIPE','MOCK','PAYOS','CASH') NOT NULL;
ALTER TABLE `reconciliation_batches` MODIFY COLUMN `provider` ENUM('VNPAY','MOMO','STRIPE','MOCK','PAYOS','CASH') NOT NULL;
