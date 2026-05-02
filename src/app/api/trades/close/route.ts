import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TradeStatus } from "@prisma/client"

const tradeInclude = { entries: true, exits: true } as const

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const tradeId = String(body.id ?? "")
    const exitPrice = Number(body.exitPrice)

    if (!tradeId || !Number.isFinite(exitPrice)) {
      return Response.json({ error: "Invalid payload" }, { status: 400 })
    }

    const trade = await prisma.trade.findFirst({
      where: { id: tradeId, userId: session.user.id },
      include: tradeInclude,
    })

    if (!trade) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }

    if (trade.status === TradeStatus.CLOSED) {
      return Response.json({ error: "Already closed" }, { status: 400 })
    }

    const entryVol = trade.entries.reduce((s, e) => s + e.volume, 0)
    const exitVol = trade.exits.reduce((s, e) => s + e.volume, 0)
    const remaining = entryVol - exitVol

    if (remaining <= 0) {
      return Response.json({ error: "No position to close" }, { status: 400 })
    }

    let exitVolume = body.exitVolume != null ? Number(body.exitVolume) : remaining
    if (!Number.isFinite(exitVolume) || exitVolume <= 0) {
      return Response.json({ error: "Invalid exit volume" }, { status: 400 })
    }
    if (exitVolume > remaining) {
      exitVolume = remaining
    }

    const newExitVol = exitVol + exitVolume
    const isFullClose = newExitVol >= entryVol - 1e-9

    await prisma.$transaction(async (tx) => {
      await tx.exit.create({
        data: {
          tradeId,
          price: exitPrice,
          volume: exitVolume,
        },
      })

      await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: isFullClose ? TradeStatus.CLOSED : TradeStatus.OPEN,
          closedAt: isFullClose ? new Date() : null,
          emotionExit: body.emotionExit != null ? String(body.emotionExit) : trade.emotionExit,
          fee: body.fee != null ? Number(body.fee) : trade.fee,
          funding: body.funding != null ? Number(body.funding) : trade.funding,
        },
      })
    })

    const updated = await prisma.trade.findFirst({
      where: { id: tradeId, userId: session.user.id },
      include: tradeInclude,
    })

    return Response.json(updated)
  } catch (e) {
    console.error(e)
    return Response.json({ error: "Close error" }, { status: 500 })
  }
}
