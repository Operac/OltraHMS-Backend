
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting Finance Diagnosis...");

    try {
        console.log("Checking Invoices...");
        const totalRevenue = await prisma.invoice.aggregate({
            _sum: { amountPaid: true },
            where: { status: { in: ['PAID', 'PARTIAL'] } }
        });
        console.log("Total Revenue (aggregated):", totalRevenue);

        console.log("Checking Expenses...");
        const totalExpenses = await prisma.expense.aggregate({
            _sum: { amount: true }
        });
        console.log("Total Expenses (aggregated):", totalExpenses);


        console.log("Calculating Profit/Loss...");
        const revenue = totalRevenue._sum.amountPaid || 0;
        const expenses = totalExpenses._sum.amount || 0;
        const netProfit = revenue - expenses;
        console.log({ revenue, expenses, netProfit });

        // Test Payment Transaction
        console.log("Testing Payment Transaction (Dry Run)...");
        // Create a dummy patient if needed, or use existing?
        const user = await prisma.user.findFirst();
        if (!user) throw new Error("No user found to process payment");

        const patient = await prisma.patient.findFirst();
        if (!patient) {
            console.log("Skipping payment test (no patient found)");
        } else {
             // Create dummy invoice
             const invoice = await prisma.invoice.create({
                data: {
                    invoiceNumber: `TEST-INV-${Date.now()}`,
                    patientId: patient.id,
                    subtotal: 100,
                    tax: 0,
                    total: 100,
                    balance: 100,
                    amountPaid: 0,
                    status: 'ISSUED',
                    items: []
                }
             });
             console.log("Created dummy invoice:", invoice.id);

             // Process Payment Transaction
             await prisma.$transaction(async (tx) => {
                const payment = await tx.payment.create({
                    data: {
                        invoiceId: invoice.id,
                        amount: 50,
                        method: 'CASH',
                        transactionReference: `REF-TEST-${Date.now()}`,
                        status: 'COMPLETED',
                        processedById: user.id
                    }
                });

                await tx.invoice.update({
                    where: { id: invoice.id },
                    data: {
                        amountPaid: 50,
                        balance: 50,
                        status: 'PARTIAL'
                    }
                });
                console.log("Transaction payment created:", payment.id);
             });

             // Cleanup
             await prisma.payment.deleteMany({ where: { invoiceId: invoice.id } });
             await prisma.invoice.delete({ where: { id: invoice.id } });
             console.log("Cleanup successful");
        }

        console.log("Diagnosis Complete: SUCCESS");
    } catch (error) {
        console.error("Diagnosis Failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
