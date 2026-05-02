import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Direction, MarketType } from "@prisma/client"

const tradeInclude = { entries: true, exits: true } as const

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const trades = await prisma.trade.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: tradeInclude,
    })
    return Response.json(trades)
  } catch (e) {
    console.error(e)
    return Response.json({ error: "GET error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const symbol = String(body.symbol ?? "").trim()
    const direction = body.direction as Direction
    const marketType = (body.marketType as MarketType) ?? MarketType.FUTURE
    const price = Number(body.price)
    const volume = Number(body.volume)

    if (!symbol || !direction || !Number.isFinite(price) || !Number.isFinite(volume) || volume <= 0) {
      return Response.json({ error: "Invalid payload" }, { status: 400 })
    }

    if (direction !== Direction.LONG && direction !== Direction.SHORT) {
      return Response.json({ error: "Invalid direction" }, { status: 400 })
    }

    const trade = await prisma.trade.create({
      data: {
        userId: session.user.id,
        symbol,
        marketType,
        direction,
        strategy: body.strategy ? String(body.strategy) : undefined,
        emotionEntry: body.emotionEntry ? String(body.emotionEntry) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        fee: body.fee != null ? Number(body.fee) : 0,
        funding: body.funding != null ? Number(body.funding) : 0,
        entries: {
          create: {
            price,
            volume,
            leverage: body.leverage != null ? Number(body.leverage) : undefined,
          },
        },
      },
      include: tradeInclude,
    })

    return Response.json(trade)
  } catch (e) {
    console.error(e)
    return Response.json({ error: "POST error" }, { status: 500 })
  }
}
