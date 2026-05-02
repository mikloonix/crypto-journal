import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash('trader123', 10)
  
  const user = await prisma.user.upsert({
    where: { email: 'admin@crypto-journal.com' },
    update: {},
    create: {
      email: 'admin@crypto-journal.com',
      password: hashedPassword,
      name: 'Trader',
      riskSettings: {
        create: {
          accountBalance: 10000,
          riskPerTrade: 1.0,
          maxDrawdown: 20.0,
          riskPerDay: 3.0,
          maxOpenRisk: 5.0
        }
      }
    }
  })
  
  console.log('✅ User created:', user.email)
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