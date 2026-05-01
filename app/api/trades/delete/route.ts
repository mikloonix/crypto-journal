import { prisma } from "@/lib/db"

export async function POST(req: Request) {
  try {
    const body = await req.json()

    await prisma.trade.delete({
      where: { id: body.id }
    })

    return Response.json({ success: true })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: "delete error" }), {
      status: 500
    })
  }
}