import { prisma } from "@/lib/db"

export async function POST(req: Request) {
  const body = await req.json()

  const trade = await prisma.trade.update({
    where: { id: body.id },
    data: {
      exitPrice: body.exitPrice,
      exitTime: new Date(),
      status: "CLOSED"
    }
  })

  return Response.json(trade)
}