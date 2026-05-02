import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const id = String(body.id ?? "")

    if (!id) {
      return Response.json({ error: "Invalid payload" }, { status: 400 })
    }

    const deleted = await prisma.trade.deleteMany({
      where: { id, userId: session.user.id },
    })

    if (deleted.count === 0) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }

    return Response.json({ success: true })
  } catch (e) {
    console.error(e)
    return Response.json({ error: "delete error" }, { status: 500 })
  }
}
