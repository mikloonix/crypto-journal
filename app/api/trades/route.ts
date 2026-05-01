import { prisma } from "@/lib/db"

export async function GET() {
  try {
    const trades = await prisma.trade.findMany({
      orderBy: { entryTime: "desc" }
    })

    return Response.json(trades)
  } catch (e) {
    console.error(e)
    return Response.json({ error: "GET error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const trade = await prisma.trade.create({
      data: {
        ticker: body.ticker,
        direction: body.direction,
        entryPrice: body.entryPrice,
        volume: body.volume,
        leverage: body.leverage || 1,
        fee: body.fee || 0
      }
    })

    return Response.json(trade)
  } catch (e) {
    console.error(e)
    return Response.json({ error: "POST error" }, { status: 500 })
  }
}