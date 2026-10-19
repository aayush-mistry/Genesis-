-- AlterTable
ALTER TABLE "Order" ADD COLUMN "transactionId" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "orderId" TEXT;
