import type { CartLine } from "../types/domain.js";

/** Validate the entire basket before applying any trade. Never substitute or partially fill. */
export function validateCart(
  lines: CartLine[],
  listings: readonly { id: string; price: number; quantityAvailable: number }[],
  cash: number,
  unitLimit = Infinity,
): CartLine[] {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) throw new Error("장바구니를 확인해 주세요.");
  const seen = new Set<string>();
  let total = 0;
  let units = 0;
  for (const line of lines) {
    if (!line || typeof line.listingId !== "string" || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || seen.has(line.listingId)) {
      throw new Error("장바구니 수량과 상품을 확인해 주세요.");
    }
    seen.add(line.listingId);
    const listing = listings.find(item => item.id === line.listingId);
    if (!listing || listing.quantityAvailable < line.quantity) throw new Error("상품이 품절되었거나 재고가 부족해요. 장바구니를 수정해 주세요. 결제되지 않았어요.");
    if (Math.abs(listing.price - line.unitPrice) > 0.000001) throw new Error("가격이 변경되었어요. 최신 가격을 확인하고 다시 결제해 주세요.");
    total += listing.price * line.quantity;
    units += line.quantity;
  }
  if (!Number.isFinite(total) || total > cash + 0.000001) throw new Error("가진 돈이 부족해요. 장바구니를 수정해 주세요.");
  if (units > unitLimit) throw new Error("가계는 한 라운드에 총 6개까지 살 수 있어요.");
  return lines.map(line => ({ ...line, unitPrice: listings.find(item => item.id === line.listingId)!.price }));
}
