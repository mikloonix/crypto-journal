import type { ApiResponse } from "@/contracts/api-response"

export function jsonOk<T>(data: T, init?: Parameters<typeof Response.json>[1]): Response {
  const body: ApiResponse<T> = { success: true, data }
  return Response.json(body, init)
}

export function jsonErr(error: string, status: number): Response {
  return Response.json({ success: false, error } satisfies ApiResponse<never>, { status })
}
