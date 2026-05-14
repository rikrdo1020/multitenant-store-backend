import { PrismaClient, UserRole, ProductStatus, ShippingType, PaymentProvider } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ---------------------------------------------------------------------------
  // Superadmin user
  // ---------------------------------------------------------------------------
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@example.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'SuperSecure123!';

  const passwordHash = await bcrypt.hash(superadminPassword, 12);

  const superadmin = await prisma.user.upsert({
    where: { email: superadminEmail },
    update: {},
    create: {
      email: superadminEmail,
      passwordHash,
      name: 'Super Admin',
      isActive: true,
    },
  });

  console.log(`Superadmin created: ${superadmin.email}`);

  // ---------------------------------------------------------------------------
  // Sample tenant
  // ---------------------------------------------------------------------------
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-store' },
    update: {},
    create: {
      slug: 'demo-store',
      name: 'Demo Store',
      status: 'active',
      primaryColor: '#6366f1',
      description: 'A sample tenant for development',
      provider: PaymentProvider.stripe,
      ownerId: superadmin.id,
    },
  });

  console.log(`Tenant created: ${tenant.slug}`);

  // Superadmin is also a member of the demo tenant with superadmin role
  await prisma.tenantMember.upsert({
    where: { userId_tenantId: { userId: superadmin.id, tenantId: tenant.id } },
    update: {},
    create: {
      userId: superadmin.id,
      tenantId: tenant.id,
      role: UserRole.superadmin,
    },
  });

  // ---------------------------------------------------------------------------
  // Tenant settings
  // ---------------------------------------------------------------------------
  await prisma.tenantSetting.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      currency: 'USD',
      taxRate: 7,
      lowStockThreshold: 5,
      emailFrom: 'noreply@demo-store.com',
      emailFromName: 'Demo Store',
    },
  });

  // ---------------------------------------------------------------------------
  // Sample category
  // ---------------------------------------------------------------------------
  const category = await prisma.category.upsert({
    where: { slug_tenantId: { slug: 'electronics', tenantId: tenant.id } },
    update: {},
    create: {
      name: 'Electronics',
      slug: 'electronics',
      description: 'Electronic devices and accessories',
      tenantId: tenant.id,
    },
  });

  // ---------------------------------------------------------------------------
  // Sample brand
  // ---------------------------------------------------------------------------
  const brand = await prisma.brand.upsert({
    where: { slug_tenantId: { slug: 'acme', tenantId: tenant.id } },
    update: {},
    create: {
      name: 'Acme',
      slug: 'acme',
      description: 'A trusted brand',
      tenantId: tenant.id,
    },
  });

  // ---------------------------------------------------------------------------
  // Sample tags
  // ---------------------------------------------------------------------------
  const tagNew = await prisma.tag.upsert({
    where: { slug_tenantId: { slug: 'new', tenantId: tenant.id } },
    update: {},
    create: { name: 'New', slug: 'new', tenantId: tenant.id },
  });

  const tagSale = await prisma.tag.upsert({
    where: { slug_tenantId: { slug: 'sale', tenantId: tenant.id } },
    update: {},
    create: { name: 'Sale', slug: 'sale', tenantId: tenant.id },
  });

  // ---------------------------------------------------------------------------
  // Sample product
  // ---------------------------------------------------------------------------
  await prisma.product.upsert({
    where: { slug_tenantId: { slug: 'wireless-headphones-pro', tenantId: tenant.id } },
    update: {},
    create: {
      name: 'Wireless Headphones Pro',
      slug: 'wireless-headphones-pro',
      dku: 'WHP-001',
      description: { type: 'doc', content: 'Premium wireless headphones with noise cancellation.' },
      price: 149.99,
      discountPrice: 129.99,
      stock: 50,
      productStatus: ProductStatus.published,
      isFeatured: true,
      featuredOrder: 1,
      categoryId: category.id,
      brandId: brand.id,
      tenantId: tenant.id,
      tags: { connect: [{ id: tagNew.id }, { id: tagSale.id }] },
      images: [],
    },
  });

  // ---------------------------------------------------------------------------
  // Sample shipping method
  // ---------------------------------------------------------------------------
  const shippingMethod = await prisma.shippingMethod.create({
    data: {
      name: 'Standard Delivery',
      type: ShippingType.delivery_zone,
      basePrice: 5.0,
      requiresDetails: true,
      tenantId: tenant.id,
    },
  });

  await prisma.shippingLocation.createMany({
    data: [
      { key: 'panama-city', label: 'Panama City', extraPrice: 0, shippingMethodId: shippingMethod.id },
      { key: 'colon', label: 'Colon', extraPrice: 3.5, shippingMethodId: shippingMethod.id },
    ],
    skipDuplicates: true,
  });

  // ---------------------------------------------------------------------------
  // Sample customer
  // ---------------------------------------------------------------------------
  await prisma.customer.upsert({
    where: { email_tenantId: { email: 'john@example.com', tenantId: tenant.id } },
    update: {},
    create: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+507 6000-0000',
      address: '123 Main St',
      city: 'Panama City',
      country: 'PA',
      tenantId: tenant.id,
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
