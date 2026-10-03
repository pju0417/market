/** Unknown historical costs stay unknown until the old stock has been exhausted. */
export function blendedInventoryCost(quantity: number, unitCost: number | undefined, added: number, cost: number): number | undefined {
  if (added <= 0) return unitCost;
  if (quantity <= 0) return cost / added;
  if (unitCost === undefined) return undefined;
  return (quantity * unitCost + cost) / (quantity + added);
}
