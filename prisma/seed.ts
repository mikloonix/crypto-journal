import { AccountSource, PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { riskSettingsCreateDefaults } from '../src/server/risk-defaults'

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash('trader123', 10)

  const user = await prisma.user.upsert({
    where: { email: 'admin@crypto-journal.com' },
    update: {
      password: hashedPassword,
      name: 'Trader',
    },
    create: {
      email: 'admin@crypto-journal.com',
      password: hashedPassword,
      name: 'Trader',
      riskSettings: {
        create: {
          ...riskSettingsCreateDefaults,
        },
      },
    },
  })

  let acc = await prisma.account.findFirst({
    where: { userId: user.id, isDefault: true },
  })
  if (!acc) {
    acc = await prisma.account.create({
      data: {
        userId: user.id,
        name: 'без привязки',
        isDefault: true,
        source: AccountSource.MANUAL,
      },
    })
    await prisma.riskSettings.upsert({
      where: { userId: user.id },
      update: { activeAccountId: acc.id },
      create: {
        userId: user.id,
        ...riskSettingsCreateDefaults,
        activeAccountId: acc.id,
      },
    })
    await prisma.trade.updateMany({
      where: { userId: user.id, accountId: null },
      data: { accountId: acc.id },
    })
  }

  console.log('✅ User:', user.email)
  console.log('🔑 Password: trader123')
}

main()
  .catch(e => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })