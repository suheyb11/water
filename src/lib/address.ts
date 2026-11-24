type Loc = { name: string } | null | undefined;
export interface AddressLike {
  localName: string;
  officialAddress?: string | null;
  description?: string | null;
  deliveryInstructions?: string | null;
  district?: Loc;
  neighborhood?: Loc;
  place?: Loc;
}

/** One-line address as people say it: local name, place, neighbourhood, district (official address in brackets). */
export function addressLine(a: AddressLike | null | undefined): string {
  if (!a) return "";
  const parts = [a.localName, a.place?.name, a.neighborhood?.name, a.district?.name]
    .filter((v, i, arr): v is string => !!v && arr.findIndex(x => x?.toLowerCase() === v.toLowerCase()) === i);
  let s = parts.join(", ");
  if (a.officialAddress) s += ` (${a.officialAddress})`;
  return s;
}

export function addressFull(a: AddressLike | null | undefined): string {
  if (!a) return "";
  return [addressLine(a), a.description, a.deliveryInstructions ? `Delivery: ${a.deliveryInstructions}` : null].filter(Boolean).join(" — ");
}
