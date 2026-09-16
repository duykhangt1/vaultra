-- refunds.deposit_portion: part of a refund that returns the security deposit (ledger DEPOSIT_REFUNDED)
ALTER TABLE `refunds` ADD COLUMN `deposit_portion` DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER `amount`;
