/**
 * Inventory Low Stock Alert Script
 * 
 * This script checks inventory levels against reorder levels and sends email alerts
 * Run this script periodically (e.g., daily via cron) to monitor stock levels
 * 
 * Usage: npx ts-node backend/scripts/check-inventory-alerts.ts
 */

import { prisma } from '../src/lib/prisma';
import { sendLowStockAlertEmail } from '../src/services/email.service';

const ADMIN_EMAIL = process.env.EMAIL_USER || 'admin@oltrahms.com';

interface LowStockItem {
  medicationId: string;
  name: string;
  currentStock: number;
  reorderLevel: number;
  category: string | null;
}

async function checkInventoryLevels() {
  console.log('🔍 Checking inventory levels...\n');

  try {
    // Get all medications with their inventory
    const medications = await prisma.medication.findMany({
      include: {
        inventory: {
          where: {
            quantity: { gt: 0 },
            expiryDate: { gt: new Date() } // Only consider non-expired stock
          }
        }
      }
    });

    const lowStockItems: LowStockItem[] = [];
    const outOfStockItems: LowStockItem[] = [];

    for (const med of medications) {
      // Calculate total stock across all batches
      const totalStock = med.inventory.reduce((sum, batch) => sum + batch.quantity, 0);

      // Check if below reorder level
      if (totalStock === 0) {
        outOfStockItems.push({
          medicationId: med.id,
          name: med.name,
          currentStock: totalStock,
          reorderLevel: med.reorderLevel,
          category: med.category
        });
      } else if (totalStock <= med.reorderLevel) {
        lowStockItems.push({
          medicationId: med.id,
          name: med.name,
          currentStock: totalStock,
          reorderLevel: med.reorderLevel,
          category: med.category
        });
      }
    }

    // Generate report
    if (outOfStockItems.length === 0 && lowStockItems.length === 0) {
      console.log('✅ All inventory levels are healthy!');
      return;
    }

    // Log findings
    if (outOfStockItems.length > 0) {
      console.log(`⚠️  OUT OF STOCK (${outOfStockItems.length} items):`);
      outOfStockItems.forEach(item => {
        console.log(`   - ${item.name} (${item.category || 'Uncategorized'})`);
      });
      console.log('');
    }

    if (lowStockItems.length > 0) {
      console.log(`⚠️  LOW STOCK (${lowStockItems.length} items below reorder level):`);
      lowStockItems.forEach(item => {
        console.log(`   - ${item.name}: ${item.currentStock}/${item.reorderLevel} (${item.category || 'Uncategorized'})`);
      });
      console.log('');
    }

    // Send email alert to admin
    const allAlertItems = [
      ...outOfStockItems.map(item => ({ ...item, currentStock: 0 })),
      ...lowStockItems
    ];
    
    if (allAlertItems.length > 0) {
      try {
        await sendLowStockAlertEmail(
          ADMIN_EMAIL,
          allAlertItems
        );
        console.log('📧 Low stock alert email sent to admin');
      } catch (emailError) {
        console.error('❌ Failed to send email:', emailError);
      }
    }

    // Return status for monitoring systems
    return {
      outOfStockCount: outOfStockItems.length,
      lowStockCount: lowStockItems.length,
      totalAlerts: outOfStockItems.length + lowStockItems.length
    };

  } catch (error) {
    console.error('❌ Error checking inventory:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
checkInventoryLevels()
  .then(result => {
    if (result) {
      console.log(`\n📊 Summary: ${result.outOfStockCount} out of stock, ${result.lowStockCount} low stock`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
