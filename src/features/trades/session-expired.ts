/** Реакция на истёкшую сессию при вызове API (middleware не перехватывает XHR). */
export function redirectOn401(router: { push: (_href: string) => void }, status: number) {
  if (status === 401) {
    router.push("/login")
  }
}
