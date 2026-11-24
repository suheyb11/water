// PDF templates (@react-pdf/renderer). Server-only; numbers arrive already formatted from posted records.
import * as React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const C = { ink: "#14213d", muted: "#5b6577", line: "#d9dee7", brand: "#1f5fa8", soft: "#eef4fb", red: "#b42318", green: "#067647" };

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, color: C.ink, fontFamily: "Helvetica" },
  head: { flexDirection: "row", justifyContent: "space-between", borderBottom: `1 solid ${C.line}`, paddingBottom: 12, marginBottom: 14 },
  company: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  muted: { color: C.muted },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.brand, textAlign: "right", textTransform: "uppercase" },
  mono: { fontFamily: "Courier", textAlign: "right" },
  label: { fontSize: 7.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  table: { borderTop: `1 solid ${C.line}`, marginTop: 8 },
  th: { flexDirection: "row", backgroundColor: C.soft, paddingVertical: 5, paddingHorizontal: 4, fontFamily: "Helvetica-Bold", fontSize: 8, color: C.muted },
  tr: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 4, borderBottom: `0.5 solid ${C.line}` },
  right: { textAlign: "right" },
  totals: { marginTop: 10, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  grand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderTop: `1 solid ${C.ink}`, marginTop: 3, fontFamily: "Helvetica-Bold", fontSize: 11 },
  footer: { position: "absolute", bottom: 22, left: 36, right: 36, fontSize: 7.5, color: C.muted, textAlign: "center", borderTop: `0.5 solid ${C.line}`, paddingTop: 6 },
  card: { backgroundColor: C.soft, borderRadius: 4, padding: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});

export interface Company { companyName: string; tagline?: string | null; address?: string | null; phone?: string | null; email?: string | null; taxNumber?: string | null; logoDataUrl?: string | null; invoiceFooter?: string | null }

function Head({ co, title, number, children }: { co: Company; title: string; number?: string; children?: React.ReactNode }) {
  return (
    <View style={s.head}>
      <View style={{ flexDirection: "row", gap: 10, maxWidth: 300 }}>
        {co.logoDataUrl && /^data:image\/(png|jpeg)/.test(co.logoDataUrl) ? <Image src={co.logoDataUrl} style={{ width: 54, height: 54, objectFit: "contain" }} /> : null}
        <View>
          <Text style={s.company}>{co.companyName}</Text>
          {co.tagline ? <Text style={s.muted}>{co.tagline}</Text> : null}
          {co.address ? <Text style={s.muted}>{co.address}</Text> : null}
          <Text style={s.muted}>{[co.phone, co.email].filter(Boolean).join("  ·  ")}</Text>
          {co.taxNumber ? <Text style={s.muted}>Tax no. {co.taxNumber}</Text> : null}
        </View>
      </View>
      <View>
        <Text style={s.title}>{title}</Text>
        {number ? <Text style={s.mono}>{number}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const Footer = ({ co, generated }: { co: Company; generated: string }) => (
  <View style={s.footer} fixed>
    {co.invoiceFooter ? <Text>{co.invoiceFooter}</Text> : null}
    <Text render={({ pageNumber, totalPages }) => `${co.companyName} · generated ${generated} · page ${pageNumber} of ${totalPages}`} />
  </View>
);

const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
  <View style={s.totalRow}><Text style={bold ? s.bold : s.muted}>{k}</Text><Text style={bold ? s.bold : {}}>{v}</Text></View>
);

// ───────── Invoice ─────────
export interface InvoicePdf {
  co: Company; title: string; number: string; date: string; due?: string | null; status: string;
  customer: { name: string; code: string; phone?: string | null; address?: string | null };
  items: { no: number; name: string; detail: string; qty: string; unitPrice: string; total: string }[];
  subtotal: string; discount?: string | null; charges?: string | null; total: string; paid: string; outstanding: string; notes?: string | null;
  payments: { ref: string; date: string; method: string; amount: string }[]; generated: string; cancelled?: string | null;
}

export function InvoiceDocument(d: InvoicePdf) {
  const cols = [24, 0, 60, 70, 75];
  return (
    <Document title={`${d.title} ${d.number}`} author={d.co.companyName}>
      <Page size="A4" style={s.page}>
        <Head co={d.co} title={d.title} number={d.number}>
          <Text style={[s.right, { marginTop: 4 }]}>Date: {d.date}</Text>
          {d.due ? <Text style={s.right}>Due: {d.due}</Text> : null}
          <Text style={[s.right, s.bold, { color: d.status === "PAID" ? C.green : d.status === "CANCELLED" ? C.muted : C.red }]}>{d.status.replaceAll("_", " ")}</Text>
        </Head>
        {d.cancelled ? <View style={[s.card, { backgroundColor: "#fdecea", marginBottom: 8 }]}><Text style={{ color: C.red }}>CANCELLED — {d.cancelled}</Text></View> : null}
        <Text style={s.label}>Bill to</Text>
        <Text style={[s.bold, { fontSize: 11 }]}>{d.customer.name} ({d.customer.code})</Text>
        {d.customer.phone ? <Text>{d.customer.phone}</Text> : null}
        {d.customer.address ? <Text style={s.muted}>{d.customer.address}</Text> : null}
        {d.items.length ? (
          <View style={s.table}>
            <View style={s.th}><Text style={{ width: cols[0] }}>#</Text><Text style={{ flex: 1 }}>Product</Text><Text style={[s.right, { width: cols[2] }]}>Qty</Text><Text style={[s.right, { width: cols[3] }]}>Unit price</Text><Text style={[s.right, { width: cols[4] }]}>Line total</Text></View>
            {d.items.map(i => (
              <View key={i.no} style={s.tr} wrap={false}>
                <Text style={{ width: cols[0], color: C.muted }}>{i.no}</Text>
                <View style={{ flex: 1 }}><Text style={s.bold}>{i.name}</Text><Text style={s.muted}>{i.detail}</Text></View>
                <Text style={[s.right, { width: cols[2] }]}>{i.qty}</Text><Text style={[s.right, { width: cols[3] }]}>{i.unitPrice}</Text><Text style={[s.right, { width: cols[4] }]}>{i.total}</Text>
              </View>
            ))}
          </View>
        ) : <View style={[s.card, { marginTop: 10 }]}><Text>{d.notes}</Text></View>}
        <View style={s.totals}>
          {d.items.length ? <Row k="Subtotal" v={d.subtotal} /> : null}
          {d.discount ? <Row k="Discount" v={`-${d.discount}`} /> : null}
          {d.charges ? <Row k="Additional charges" v={d.charges} /> : null}
          <View style={s.grand}><Text>Grand total</Text><Text>{d.total}</Text></View>
          <Row k="Paid / settled" v={d.paid} />
          <Row k="Outstanding" v={d.outstanding} bold />
        </View>
        {d.payments.length ? (
          <View style={{ marginTop: 14 }}>
            <Text style={s.label}>Payment history</Text>
            {d.payments.map((p, i) => <Text key={i} style={s.muted}>{p.date}  {p.ref}  {p.method}  {p.amount}</Text>)}
          </View>
        ) : null}
        {d.items.length && d.notes ? <Text style={[s.muted, { marginTop: 12 }]}>{d.notes}</Text> : null}
        <Footer co={d.co} generated={d.generated} />
      </Page>
    </Document>
  );
}

// ───────── Receipt ─────────
export interface ReceiptPdf { co: Company; number: string; date: string; customer: { name: string; code: string; phone: string; address?: string | null }; amount: string; method: string; reference?: string | null; status: string; lines: { ref: string; amount: string }[]; advance?: string | null; generated: string; recordedBy: string }

export function ReceiptDocument(d: ReceiptPdf) {
  return (
    <Document title={`Receipt ${d.number}`} author={d.co.companyName}>
      <Page size="A5" style={s.page}>
        <Head co={d.co} title="Receipt" number={d.number}><Text style={[s.right, { marginTop: 4 }]}>Date: {d.date}</Text>{d.status !== "POSTED" ? <Text style={[s.right, s.bold, { color: C.red }]}>{d.status}</Text> : null}</Head>
        <Text style={s.label}>Received from</Text>
        <Text style={[s.bold, { fontSize: 11 }]}>{d.customer.name} ({d.customer.code})</Text>
        <Text>{d.customer.phone}</Text>
        {d.customer.address ? <Text style={s.muted}>{d.customer.address}</Text> : null}
        <View style={[s.card, { marginTop: 12, alignItems: "center" }]}><Text style={s.muted}>Amount received</Text><Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold" }}>{d.amount}</Text><Text>{d.method}{d.reference ? ` · ref ${d.reference}` : ""}</Text></View>
        <View style={s.table}>
          {d.lines.map((l, i) => <View key={i} style={s.tr}><Text style={{ flex: 1 }}>Applied to {l.ref}</Text><Text style={s.right}>{l.amount}</Text></View>)}
          {d.advance ? <View style={s.tr}><Text style={{ flex: 1 }}>Kept as advance credit</Text><Text style={s.right}>{d.advance}</Text></View> : null}
        </View>
        <Text style={[s.muted, { marginTop: 10 }]}>Received by {d.recordedBy}</Text>
        <Footer co={d.co} generated={d.generated} />
      </Page>
    </Document>
  );
}

// ───────── Customer statement ─────────
export interface StatementPdf { co: Company; customer: { name: string; code: string; phone: string; address?: string | null }; from: string; to: string; opening: string; totalDebit: string; totalCredit: string; closing: string; closingNote: string; rows: { date: string; ref: string; type: string; description: string; debit: string; credit: string; balance: string }[]; generated: string }

export function StatementDocument(d: StatementPdf) {
  return (
    <Document title={`Statement ${d.customer.code} ${d.from}–${d.to}`} author={d.co.companyName}>
      <Page size="A4" style={s.page}>
        <Head co={d.co} title="Statement of account"><Text style={[s.right, { marginTop: 4 }]}>{d.from} to {d.to}</Text></Head>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View><Text style={s.label}>Customer</Text><Text style={[s.bold, { fontSize: 11 }]}>{d.customer.name} ({d.customer.code})</Text><Text>{d.customer.phone}</Text>{d.customer.address ? <Text style={[s.muted, { maxWidth: 280 }]}>{d.customer.address}</Text> : null}</View>
          <View style={[s.card, { width: 200 }]}><Row k="Opening balance" v={d.opening} /><Row k="Debits (purchases, charges)" v={d.totalDebit} /><Row k="Credits (payments, returns)" v={d.totalCredit} /><View style={s.grand}><Text>Closing balance</Text><Text>{d.closing}</Text></View><Text style={[s.muted, { textAlign: "right" }]}>{d.closingNote}</Text></View>
        </View>
        <View style={s.table}>
          <View style={s.th} fixed><Text style={{ width: 56 }}>Date</Text><Text style={{ width: 84 }}>Reference</Text><Text style={{ flex: 1 }}>Description</Text><Text style={[s.right, { width: 60 }]}>Debit</Text><Text style={[s.right, { width: 60 }]}>Credit</Text><Text style={[s.right, { width: 66 }]}>Balance</Text></View>
          <View style={s.tr}><Text style={{ width: 56 }}>{d.from}</Text><Text style={{ width: 84 }} /><Text style={[{ flex: 1 }, s.bold]}>Opening balance</Text><Text style={{ width: 60 }} /><Text style={{ width: 60 }} /><Text style={[s.right, s.bold, { width: 66 }]}>{d.opening}</Text></View>
          {d.rows.map((r, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={{ width: 56 }}>{r.date}</Text><Text style={{ width: 84 }}>{r.ref}</Text>
              <View style={{ flex: 1 }}><Text>{r.type}</Text><Text style={s.muted}>{r.description}</Text></View>
              <Text style={[s.right, { width: 60 }]}>{r.debit}</Text><Text style={[s.right, { width: 60 }]}>{r.credit}</Text><Text style={[s.right, { width: 66 }]}>{r.balance}</Text>
            </View>
          ))}
          <View style={[s.tr, { backgroundColor: C.soft }]}><Text style={[{ flex: 1 }, s.bold]}>Closing balance {d.to}</Text><Text style={[s.right, s.bold, { width: 60 }]}>{d.totalDebit}</Text><Text style={[s.right, s.bold, { width: 60 }]}>{d.totalCredit}</Text><Text style={[s.right, s.bold, { width: 66 }]}>{d.closing}</Text></View>
        </View>
        <Text style={[s.muted, { marginTop: 8 }]}>Positive balance = amount owed to {d.co.companyName}. Negative balance = advance credit held for the customer.</Text>
        <Footer co={d.co} generated={d.generated} />
      </Page>
    </Document>
  );
}

// ───────── Daily / period report ─────────
const NUMERIC = /^(Amount|Total|Paid at sale|Qty|In|Out|Net)$/;
export interface DailyPdf { co: Company; from: string; to: string; generated: string; blocks: { title: string; rows: [string, string][] }[]; tables: { title: string; head: string[]; rows: string[][]; widths: number[] }[] }

export function DailyDocument(d: DailyPdf) {
  return (
    <Document title={`Statement ${d.from}–${d.to}`} author={d.co.companyName}>
      <Page size="A4" style={s.page}>
        <Head co={d.co} title={d.from === d.to ? "Daily statement" : "Period statement"}><Text style={[s.right, { marginTop: 4 }]}>{d.from === d.to ? d.from : `${d.from} to ${d.to}`}</Text></Head>
        <View style={s.grid}>
          {d.blocks.map(b => (
            <View key={b.title} style={[s.card, { width: "48.8%" }]} wrap={false}>
              <Text style={[s.bold, { marginBottom: 4, color: C.brand }]}>{b.title}</Text>
              {b.rows.map(([k, v]) => <Row key={k} k={k} v={v} bold={k.startsWith("=")} />)}
            </View>
          ))}
        </View>
        {d.tables.filter(t => t.rows.length).map(t => (
          <View key={t.title} style={{ marginTop: 14 }}>
            <Text style={[s.bold, { fontSize: 10.5 }]}>{t.title}</Text>
            <View style={s.table}>
              <View style={s.th}>{t.head.map((h, i) => <Text key={h} style={[{ width: t.widths[i] || undefined, flex: t.widths[i] ? undefined : 1 }, i >= t.head.length - 1 || NUMERIC.test(h) ? s.right : {}]}>{h}</Text>)}</View>
              {t.rows.map((r, j) => <View key={j} style={s.tr} wrap={false}>{r.map((c, i) => <Text key={i} style={[{ width: t.widths[i] || undefined, flex: t.widths[i] ? undefined : 1 }, i >= r.length - 1 || NUMERIC.test(t.head[i]) ? s.right : {}]}>{c}</Text>)}</View>)}
            </View>
          </View>
        ))}
        <Footer co={d.co} generated={d.generated} />
      </Page>
    </Document>
  );
}
