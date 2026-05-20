import { PrismaClient, UserRole, ProductStatus, ShippingType, PaymentProvider } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ---------------------------------------------------------------------------
  // Superadmin — no tenant, no TenantMember
  // ---------------------------------------------------------------------------
  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@example.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? 'SuperSecure123!';

  const superadmin = await prisma.user.upsert({
    where: { email: superadminEmail },
    update: {},
    create: {
      email: superadminEmail,
      passwordHash: await bcrypt.hash(superadminPassword, 12),
      name: 'Super Admin',
      isActive: true,
    },
  });

  console.log(`Superadmin created: ${superadmin.email}`);

  // ---------------------------------------------------------------------------
  // Tenant owner user
  // ---------------------------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@demo-store.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'AdminSecure123!';

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      name: 'Store Admin',
      isActive: true,
    },
  });

  console.log(`Admin user created: ${adminUser.email}`);

  // ---------------------------------------------------------------------------
  // Tenant 1 — Demo Store
  // ---------------------------------------------------------------------------
  await seedTenant({
    slug: 'demo-store',
    name: 'Demo Store',
    primaryColor: '#6366f1',
    description: 'Electronics and gadgets store',
    ownerId: adminUser.id,
    adminUserId: adminUser.id,
    emailFrom: 'noreply@demo-store.com',
    emailFromName: 'Demo Store',
    currency: 'USD',
    taxRate: 7,
    categories: [
      { name: 'Electronics', slug: 'electronics', description: 'Electronic devices and accessories' },
      { name: 'Audio', slug: 'audio', description: 'Headphones, speakers, and audio gear' },
    ],
    brands: [
      { name: 'Acme', slug: 'acme', description: 'Trusted electronics brand' },
      { name: 'SoundWave', slug: 'soundwave', description: 'Premium audio equipment' },
    ],
    tags: [
      { name: 'New', slug: 'new' },
      { name: 'Sale', slug: 'sale' },
      { name: 'Featured', slug: 'featured' },
    ],
    products: [
      {
        name: 'Wireless Headphones Pro',
        slug: 'wireless-headphones-pro',
        dku: 'WHP-001',
        description: 'Premium wireless headphones with active noise cancellation.',
        price: 149.99,
        discountPrice: 129.99,
        stock: 50,
        categorySlug: 'audio',
        brandSlug: 'soundwave',
        tagSlugs: ['new', 'featured'],
        isFeatured: true,
        featuredOrder: 1,
      },
      {
        name: 'USB-C Hub 7-in-1',
        slug: 'usbc-hub-7in1',
        dku: 'UCH-001',
        description: 'Compact 7-in-1 USB-C hub with 4K HDMI and 100W PD.',
        price: 59.99,
        discountPrice: null,
        stock: 120,
        categorySlug: 'electronics',
        brandSlug: 'acme',
        tagSlugs: ['new'],
        isFeatured: false,
        featuredOrder: null,
      },
      {
        name: 'Bluetooth Speaker Mini',
        slug: 'bluetooth-speaker-mini',
        dku: 'BSM-001',
        description: 'Portable waterproof speaker with 12h battery life.',
        price: 39.99,
        discountPrice: 29.99,
        stock: 85,
        categorySlug: 'audio',
        brandSlug: 'soundwave',
        tagSlugs: ['sale', 'featured'],
        isFeatured: true,
        featuredOrder: 2,
      },
    ],
    shippingMethods: [
      {
        name: 'Standard Delivery',
        type: ShippingType.delivery_zone,
        basePrice: 5.0,
        requiresDetails: true,
        locations: [
          { key: 'panama-city', label: 'Panama City', extraPrice: 0 },
          { key: 'colon', label: 'Colon', extraPrice: 3.5 },
        ],
      },
      {
        name: 'Store Pickup',
        type: ShippingType.pickup_point,
        basePrice: 0,
        requiresDetails: false,
        locations: [
          { key: 'pickup-paitilla', label: 'Paitilla Branch', extraPrice: 0 },
          { key: 'pickup-albrook', label: 'Albrook Branch', extraPrice: 0 },
        ],
      },
    ],
    customers: [
      { name: 'John Doe', email: 'john@example.com', phone: '+507 6000-0001', city: 'Panama City' },
      { name: 'Maria Lopez', email: 'maria@example.com', phone: '+507 6000-0002', city: 'Colon' },
    ],
  });

  // ---------------------------------------------------------------------------
  // Tenant 2 — Fashion Hub
  // ---------------------------------------------------------------------------
  const fashion2Email = 'admin@fashion-hub.com';
  const fashionAdmin = await prisma.user.upsert({
    where: { email: fashion2Email },
    update: {},
    create: {
      email: fashion2Email,
      passwordHash: await bcrypt.hash('FashionAdmin123!', 12),
      name: 'Fashion Admin',
      isActive: true,
    },
  });

  console.log(`Fashion admin created: ${fashionAdmin.email}`);

  await seedTenant({
    slug: 'fashion-hub',
    name: 'Fashion Hub',
    primaryColor: '#ec4899',
    description: 'Trendy clothing and accessories',
    ownerId: fashionAdmin.id,
    adminUserId: fashionAdmin.id,
    emailFrom: 'noreply@fashion-hub.com',
    emailFromName: 'Fashion Hub',
    currency: 'USD',
    taxRate: 7,
    categories: [
      { name: 'Clothing', slug: 'clothing', description: 'Shirts, pants, dresses' },
      { name: 'Accessories', slug: 'accessories', description: 'Bags, belts, jewelry' },
    ],
    brands: [
      { name: 'UrbanThreads', slug: 'urbanthreads', description: 'Urban street fashion' },
      { name: 'LuxLeather', slug: 'luxleather', description: 'Premium leather goods' },
    ],
    tags: [
      { name: 'New Arrival', slug: 'new-arrival' },
      { name: 'Best Seller', slug: 'best-seller' },
      { name: 'Limited', slug: 'limited' },
    ],
    products: [
      {
        name: 'Classic White Tee',
        slug: 'classic-white-tee',
        dku: 'CWT-001',
        description: '100% organic cotton crew neck tee.',
        price: 24.99,
        discountPrice: null,
        stock: 200,
        categorySlug: 'clothing',
        brandSlug: 'urbanthreads',
        tagSlugs: ['new-arrival', 'best-seller'],
        isFeatured: true,
        featuredOrder: 1,
      },
      {
        name: 'Leather Crossbody Bag',
        slug: 'leather-crossbody-bag',
        dku: 'LCB-001',
        description: 'Handcrafted full-grain leather crossbody bag.',
        price: 189.99,
        discountPrice: 159.99,
        stock: 30,
        categorySlug: 'accessories',
        brandSlug: 'luxleather',
        tagSlugs: ['limited'],
        isFeatured: true,
        featuredOrder: 2,
      },
      {
        name: 'Slim Fit Chinos',
        slug: 'slim-fit-chinos',
        dku: 'SFC-001',
        description: 'Stretch slim-fit chinos in khaki.',
        price: 54.99,
        discountPrice: 44.99,
        stock: 75,
        categorySlug: 'clothing',
        brandSlug: 'urbanthreads',
        tagSlugs: ['best-seller'],
        isFeatured: false,
        featuredOrder: null,
      },
    ],
    shippingMethods: [
      {
        name: 'Express Delivery',
        type: ShippingType.delivery_zone,
        basePrice: 8.0,
        requiresDetails: true,
        locations: [
          { key: 'panama-city', label: 'Panama City', extraPrice: 0 },
          { key: 'san-miguelito', label: 'San Miguelito', extraPrice: 1.5 },
        ],
      },
      {
        name: 'Third Party Courier',
        type: ShippingType.third_party,
        basePrice: 4.0,
        requiresDetails: false,
        locations: [],
      },
    ],
    customers: [
      { name: 'Ana Torres', email: 'ana@example.com', phone: '+507 6100-0001', city: 'Panama City' },
      { name: 'Carlos Ruiz', email: 'carlos@example.com', phone: '+507 6100-0002', city: 'David' },
    ],
  });

  console.log('Seed complete.');
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
interface SeedTenantInput {
  slug: string;
  name: string;
  primaryColor: string;
  description: string;
  ownerId: string;
  adminUserId: string;
  emailFrom: string;
  emailFromName: string;
  currency: string;
  taxRate: number;
  categories: { name: string; slug: string; description: string }[];
  brands: { name: string; slug: string; description: string }[];
  tags: { name: string; slug: string }[];
  products: {
    name: string;
    slug: string;
    dku: string;
    description: string;
    price: number;
    discountPrice: number | null;
    stock: number;
    categorySlug: string;
    brandSlug: string;
    tagSlugs: string[];
    isFeatured: boolean;
    featuredOrder: number | null;
  }[];
  shippingMethods: {
    name: string;
    type: ShippingType;
    basePrice: number;
    requiresDetails: boolean;
    locations: { key: string; label: string; extraPrice: number }[];
  }[];
  customers: { name: string; email: string; phone: string; city: string }[];
}

async function seedTenant(input: SeedTenantInput) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: input.slug },
    update: {},
    create: {
      slug: input.slug,
      name: input.name,
      status: 'active',
      primaryColor: input.primaryColor,
      description: input.description,
      provider: PaymentProvider.stripe,
      ownerId: input.ownerId,
    },
  });

  console.log(`Tenant created: ${tenant.slug}`);

  await prisma.tenantMember.upsert({
    where: { userId_tenantId: { userId: input.adminUserId, tenantId: tenant.id } },
    update: {},
    create: { userId: input.adminUserId, tenantId: tenant.id, role: UserRole.admin },
  });

  await prisma.tenantSetting.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      currency: input.currency,
      taxRate: input.taxRate,
      lowStockThreshold: 5,
      emailFrom: input.emailFrom,
      emailFromName: input.emailFromName,
    },
  });

  // Categories
  const categoryMap: Record<string, string> = {};
  for (const cat of input.categories) {
    const record = await prisma.category.upsert({
      where: { slug_tenantId: { slug: cat.slug, tenantId: tenant.id } },
      update: {},
      create: { name: cat.name, slug: cat.slug, description: cat.description, tenantId: tenant.id },
    });
    categoryMap[cat.slug] = record.id;
  }

  // Brands
  const brandMap: Record<string, string> = {};
  for (const b of input.brands) {
    const record = await prisma.brand.upsert({
      where: { slug_tenantId: { slug: b.slug, tenantId: tenant.id } },
      update: {},
      create: { name: b.name, slug: b.slug, description: b.description, tenantId: tenant.id },
    });
    brandMap[b.slug] = record.id;
  }

  // Tags
  const tagMap: Record<string, string> = {};
  for (const t of input.tags) {
    const record = await prisma.tag.upsert({
      where: { slug_tenantId: { slug: t.slug, tenantId: tenant.id } },
      update: {},
      create: { name: t.name, slug: t.slug, tenantId: tenant.id },
    });
    tagMap[t.slug] = record.id;
  }

  // Products
  for (const p of input.products) {
    await prisma.product.upsert({
      where: { slug_tenantId: { slug: p.slug, tenantId: tenant.id } },
      update: {},
      create: {
        name: p.name,
        slug: p.slug,
        dku: p.dku,
        description: { type: 'doc', content: p.description },
        price: p.price,
        discountPrice: p.discountPrice ?? undefined,
        stock: p.stock,
        productStatus: ProductStatus.published,
        isFeatured: p.isFeatured,
        featuredOrder: p.featuredOrder ?? undefined,
        categoryId: categoryMap[p.categorySlug],
        brandId: brandMap[p.brandSlug],
        tenantId: tenant.id,
        tags: { connect: p.tagSlugs.map((s) => ({ id: tagMap[s] })) },
        images: [],
      },
    });
  }

  // Shipping methods — no unique on name+tenantId, check before create
  for (const sm of input.shippingMethods) {
    let method = await prisma.shippingMethod.findFirst({
      where: { name: sm.name, tenantId: tenant.id },
    });

    if (!method) {
      method = await prisma.shippingMethod.create({
        data: {
          name: sm.name,
          type: sm.type,
          basePrice: sm.basePrice,
          requiresDetails: sm.requiresDetails,
          tenantId: tenant.id,
        },
      });
    }

    if (sm.locations.length > 0) {
      await prisma.shippingLocation.createMany({
        data: sm.locations.map((loc) => ({
          key: loc.key,
          label: loc.label,
          extraPrice: loc.extraPrice,
          shippingMethodId: method!.id,
        })),
        skipDuplicates: true,
      });
    }
  }

  // Customers
  for (const c of input.customers) {
    await prisma.customer.upsert({
      where: { email_tenantId: { email: c.email, tenantId: tenant.id } },
      update: {},
      create: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        city: c.city,
        country: 'PA',
        tenantId: tenant.id,
      },
    });
  }

  console.log(`Seeded tenant data: ${tenant.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
