/** Maps items with an async function, running at most `limit` calls at once; results keep the input order. */
export async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  map: (item: Item) => Promise<Result>
): Promise<Result[]> {
  const results = new Array<Result>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await map(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
