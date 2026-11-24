"use client";
import * as React from "react";
import { Field, Input, Textarea } from "@/components/ui/primitives";

export interface LocOpt { id: number; kind: string; name: string; parentId: number | null; alsoKnownAs?: string | null }
export interface AddressValue {
  id?: number; label?: string; localName: string; officialAddress?: string; districtId?: string; neighborhoodId?: string; placeId?: string;
  description?: string; deliveryInstructions?: string; latitude?: string; longitude?: string; isPrimary?: boolean;
}
export const emptyAddress: AddressValue = { localName: "", officialAddress: "", districtId: "", neighborhoodId: "", placeId: "", description: "", deliveryInstructions: "", latitude: "", longitude: "" };

const sel = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring/50";

/** Address entry the way people describe places locally; official address and GPS are optional. */
export function AddressFields({ value, onChange, locations, errors = {}, prefix = "address." }: { value: AddressValue; onChange: (v: AddressValue) => void; locations: LocOpt[]; errors?: Record<string, string>; prefix?: string }) {
  const set = (k: keyof AddressValue, v: string) => onChange({ ...value, [k]: v });
  const districts = locations.filter(l => l.kind === "DISTRICT");
  const hoods = locations.filter(l => l.kind === "NEIGHBORHOOD" && (!value.districtId || l.parentId === Number(value.districtId) || l.parentId === null));
  const places = locations.filter(l => l.kind === "PLACE" && (!value.neighborhoodId || l.parentId === Number(value.neighborhoodId) || l.parentId === null));
  const err = (k: string) => errors[prefix + k];
  const gps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => onChange({ ...value, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }));
  };
  return (
    <div className="grid gap-4">
      <Field label="Local address name *" hint="What people call the place — e.g. “Behind Isgoyska Dabka, blue gate”" error={err("localName")}>
        <Input value={value.localName} onChange={e => set("localName", e.target.value)} placeholder="Name known by local people" aria-invalid={!!err("localName")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="District">
          <select className={sel} value={value.districtId ?? ""} onChange={e => onChange({ ...value, districtId: e.target.value, neighborhoodId: "", placeId: "" })}>
            <option value="">—</option>{districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Neighbourhood">
          <select className={sel} value={value.neighborhoodId ?? ""} onChange={e => {
            const h = locations.find(l => l.id === Number(e.target.value));
            onChange({ ...value, neighborhoodId: e.target.value, placeId: "", districtId: h?.parentId ? String(h.parentId) : value.districtId });
          }}>
            <option value="">—</option>{hoods.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Known place / landmark">
          <select className={sel} value={value.placeId ?? ""} onChange={e => {
            const p = locations.find(l => l.id === Number(e.target.value));
            const h = p?.parentId ? locations.find(l => l.id === p.parentId) : undefined;
            onChange({ ...value, placeId: e.target.value, neighborhoodId: h ? String(h.id) : value.neighborhoodId, districtId: h?.parentId ? String(h.parentId) : value.districtId });
          }}>
            <option value="">—</option>{places.map(d => <option key={d.id} value={d.id}>{d.name}{d.alsoKnownAs ? ` (${d.alsoKnownAs})` : ""}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Description of the place" hint="Building, colour of the door, floor…"><Textarea rows={2} value={value.description ?? ""} onChange={e => set("description", e.target.value)} /></Field>
        <Field label="Delivery instructions" hint="Call first, use back entrance, deliver before noon…"><Textarea rows={2} value={value.deliveryInstructions ?? ""} onChange={e => set("deliveryInstructions", e.target.value)} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end">
        <Field label="Official address (optional)"><Input value={value.officialAddress ?? ""} onChange={e => set("officialAddress", e.target.value)} /></Field>
        <Field label="Latitude" error={err("latitude")}><Input inputMode="decimal" value={value.latitude ?? ""} onChange={e => set("latitude", e.target.value)} placeholder="2.0469" /></Field>
        <Field label="Longitude" error={err("longitude")}><Input inputMode="decimal" value={value.longitude ?? ""} onChange={e => set("longitude", e.target.value)} placeholder="45.3182" /></Field>
        <button type="button" onClick={gps} className="h-9 rounded-md border bg-card px-3 text-sm hover:bg-accent">Use my location</button>
      </div>
    </div>
  );
}

export function addressPayload(a: AddressValue) {
  return {
    ...(a.id ? { id: a.id } : {}),
    label: a.label || undefined,
    isPrimary: a.isPrimary ?? true,
    localName: a.localName,
    officialAddress: a.officialAddress || null,
    districtId: a.districtId || null,
    neighborhoodId: a.neighborhoodId || null,
    placeId: a.placeId || null,
    description: a.description || null,
    deliveryInstructions: a.deliveryInstructions || null,
    latitude: a.latitude || null,
    longitude: a.longitude || null,
  };
}
