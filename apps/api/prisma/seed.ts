import { PrismaService } from "src/prisma.service";

const prisma = new PrismaService();

async function main() {
    await prisma.revenueOpportunity.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.business.deleteMany();

    const business = await prisma.business.create({
            data: {
                name: 'Acme Digital Services',
                currency: 'USD'
            }
        });

    const customers = [
        {
            name: 'Sarah Johnson',
            email: 'sarah@example.com',
            riskLevel: 'LOW'
        },
        {
            name: 'Michael Brown',
            email: 'michael@example.com',
            riskLevel: 'LOW'
        },
            {
            name: 'David Wilson',
            email: 'david@example.com',
            riskLevel: 'MEDIUM'
        },
        {
            name: 'Emma Davis',
            email: 'emma@example.com',
            riskLevel: 'MEDIUM'
        },
        {
            name: 'James Miller',
            email: 'james@example.com',
            riskLevel: 'HIGH'
        },
        {
            name: 'Olivia Taylor',
            email: 'olivia@example.com',
            riskLevel: 'LOW'
        },
        {
            name: 'Daniel Anderson',
            email: 'daniel@example.com',
            riskLevel: 'HIGH'
        },
        {
            name: 'Sophia Thomas',
            email: 'sophia@example.com',
            riskLevel: 'MEDIUM'
        },
        {
            name: 'William Jackson',
            email: 'william@example.com',
            riskLevel: 'HIGH'
        },
        {
            name: 'Ava White',
            email: 'ava@example.com',
            riskLevel: 'LOW'
        },
        {
            name: 'Noah Harris',
            email: 'noah@example.com',
            riskLevel: 'MEDIUM'
        },
        {
            name: 'Isabella Martin',
            email: 'isabella@example.com',
            riskLevel: 'HIGH'
        },
        {
            name: 'Ethan Thompson',
            email: 'ethan@example.com',
            riskLevel: 'LOW'
        },
        {
            name: 'Mia Garcia',
            email: 'mia@example.com',
            riskLevel: 'MEDIUM'
        },
    ];

    const createdCustomers: any = [];

    for (const customer of customers) {
        const created = await prisma.customer.create({
            data: {
                businessId: business.id,
                ...customer,
            },
        });

        createdCustomers.push(created);
    }

    const today = new Date();

    const invoices = [
        180,
        120,
        250,
        150,
        400,
        100,
        300,
        180,
        200,
        90,
        110,
        100,
        70,
        130,
    ];

    for (let index = 0; index < invoices.length; index++) {
        const customer = createdCustomers[index];
        const daysOverdue = 8 + (index % 6) * 4;
        const dueAt = new Date(today);

        dueAt.setDate(dueAt.getDate() - daysOverdue);
        
        const issuedAt = new Date(dueAt);
        issuedAt.setDate(issuedAt.getDate() - 30);

        await prisma.invoice.create({
            data: {
                businessId: business.id,
                customerId: customer.id,

                invoiceNumber: `INV-${String(index + 1).padStart(4, '0')}`,
                amount: invoices[index],
                currencyCode: 'USD',
                status: 'OVERDUE',
                issuedAt,
                dueAt,
                reminderCount: index % 4,
            }
        });
    }

    console.log(`Created demo business: ${business.name}`);
    console.log(`Created ${createdCustomers.length} customers`);
    console.log(`Created ${invoices.length} overdue invoices`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });