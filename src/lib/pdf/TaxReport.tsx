import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  // Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  brand: { fontSize: 13, fontWeight: "bold", color: "#000" },
  tagline: { fontSize: 8, color: "#888", marginTop: 2 },
  docTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 2 },
  docSubtitle: { fontSize: 9, color: "#666" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 14 },
  // KPI strip
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  kpiBox: { flex: 1, backgroundColor: "#f9fafb", borderRadius: 6, padding: 10 },
  kpiLabel: { fontSize: 8, color: "#6b7280", marginBottom: 3 },
  kpiValue: { fontSize: 14, fontWeight: "bold" },
  kpiValueGreen: { fontSize: 14, fontWeight: "bold", color: "#16a34a" },
  // Tables
  sectionTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 8, color: "#111" },
  tableHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", paddingVertical: 5, paddingHorizontal: 8, borderRadius: 4, marginBottom: 2 },
  tableHeaderCell: { fontSize: 8, fontWeight: "bold", color: "#6b7280" },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  tableRowAlt: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "#fafafa", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  cell: { fontSize: 9, color: "#374151" },
  cellMono: { fontSize: 8, color: "#4b5563", fontFamily: "Courier" },
  // cols
  colDate: { width: 90 },
  colType: { width: 70 },
  colAmount: { width: 72, textAlign: "right" },
  colStatus: { width: 70 },
  colId: { flex: 1 },
  // Footer
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#9ca3af" },
  notice: { marginTop: 18, backgroundColor: "#fffbeb", borderRadius: 6, padding: 10 },
  noticeText: { fontSize: 8, color: "#92400e", lineHeight: 1.5 },
});

export type TaxReportData = {
  year: number;
  creatorName: string;
  creatorEmail: string | null;
  total_earnings: number;
  total_payouts: number;
  sales: Array<{
    id: string;
    created_at: string;
    creator_earnings: number;
    status: string;
    stripe_session_id?: string | null;
  }>;
  payouts: Array<{
    id: string;
    processed_at: string | null;
    amount: number;
    status: string;
    stripe_transfer_id?: string | null;
    receipt_url?: string | null;
  }>;
  generatedAt: string;
};

function fmtUSD(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shortId(id: string) {
  return id.slice(0, 8) + "…";
}

export function TaxReport({ data }: { data: TaxReportData }) {
  return (
    <Document
      title={`TipLink Tax Summary ${data.year}`}
      author="TipLink"
      subject={`Creator Earnings Report ${data.year}`}
    >
      <Page size="A4" style={styles.page}>

        {/* ── Header ─────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>TipLink</Text>
            <Text style={styles.tagline}>Creator Earnings Platform</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Tax Summary {data.year}</Text>
            <Text style={styles.docSubtitle}>{data.creatorName}</Text>
            {data.creatorEmail && (
              <Text style={styles.docSubtitle}>{data.creatorEmail}</Text>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── KPI strip ──────────────────────────────────── */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Total Earnings ({data.year})</Text>
            <Text style={styles.kpiValueGreen}>{fmtUSD(data.total_earnings)}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Total Paid Out ({data.year})</Text>
            <Text style={styles.kpiValue}>{fmtUSD(data.total_payouts)}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Theme Sales</Text>
            <Text style={styles.kpiValue}>{data.sales.length}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Payouts Issued</Text>
            <Text style={styles.kpiValue}>{data.payouts.length}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Sales table ────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Theme Sales</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colDate]}>Date</Text>
          <Text style={[styles.tableHeaderCell, styles.colStatus]}>Status</Text>
          <Text style={[styles.tableHeaderCell, styles.colAmount]}>Creator Earnings</Text>
          <Text style={[styles.tableHeaderCell, styles.colId]}>Sale ID</Text>
        </View>
        {data.sales.length === 0 && (
          <View style={styles.tableRow}>
            <Text style={[styles.cell, { color: "#9ca3af" }]}>No sales in {data.year}</Text>
          </View>
        )}
        {data.sales.map((s, i) => (
          <View key={s.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={[styles.cell, styles.colDate]}>{fmtDate(s.created_at)}</Text>
            <Text style={[styles.cell, styles.colStatus]}>{s.status}</Text>
            <Text style={[styles.cell, styles.colAmount]}>{fmtUSD(Number(s.creator_earnings))}</Text>
            <Text style={[styles.cellMono, styles.colId]}>{shortId(s.id)}</Text>
          </View>
        ))}

        <View style={[styles.divider, { marginTop: 14 }]} />

        {/* ── Payouts table ──────────────────────────────── */}
        <Text style={styles.sectionTitle}>Payouts Received</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.colDate]}>Date</Text>
          <Text style={[styles.tableHeaderCell, styles.colStatus]}>Status</Text>
          <Text style={[styles.tableHeaderCell, styles.colAmount]}>Amount</Text>
          <Text style={[styles.tableHeaderCell, styles.colId]}>Transfer ID</Text>
        </View>
        {data.payouts.length === 0 && (
          <View style={styles.tableRow}>
            <Text style={[styles.cell, { color: "#9ca3af" }]}>No payouts in {data.year}</Text>
          </View>
        )}
        {data.payouts.map((p, i) => (
          <View key={p.id} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={[styles.cell, styles.colDate]}>{fmtDate(p.processed_at)}</Text>
            <Text style={[styles.cell, styles.colStatus]}>{p.status}</Text>
            <Text style={[styles.cell, styles.colAmount]}>{fmtUSD(Number(p.amount))}</Text>
            <Text style={[styles.cellMono, styles.colId]}>{p.stripe_transfer_id ? shortId(p.stripe_transfer_id) : "—"}</Text>
          </View>
        ))}

        {/* ── Disclaimer ─────────────────────────────────── */}
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            This document is a summary of creator earnings and payouts processed through TipLink for the {data.year} tax year.
            It is provided for informational purposes and to assist with tax preparation. This is NOT an official IRS form.
            Consult a qualified tax professional for filing guidance. Earnings may be subject to self-employment tax.
          </Text>
        </View>

        {/* ── Footer ─────────────────────────────────────── */}
        <View style={styles.footer}>
          <Text>Generated {fmtDate(data.generatedAt)} · TipLink Creator Platform</Text>
          <Text>FOR INFORMATIONAL USE ONLY — NOT AN OFFICIAL TAX DOCUMENT</Text>
        </View>

      </Page>
    </Document>
  );
}
