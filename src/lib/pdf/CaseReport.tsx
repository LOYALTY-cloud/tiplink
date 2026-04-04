import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer"
import React from "react"

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 16 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#888" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#ddd", marginVertical: 10 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 6, color: "#111" },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 120, fontWeight: "bold", color: "#555" },
  value: { flex: 1, color: "#111" },
  badge: { fontSize: 9, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start" },
  badgeHigh: { backgroundColor: "#fecaca", color: "#991b1b" },
  badgeMedium: { backgroundColor: "#fef3c7", color: "#92400e" },
  badgeLow: { backgroundColor: "#d1fae5", color: "#065f46" },
  eventRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 8 },
  eventTime: { width: 140, color: "#666" },
  eventAction: { flex: 1, color: "#222" },
  bullet: { color: "#999", marginRight: 4 },
  aiBox: { backgroundColor: "#f8f9fa", padding: 10, borderRadius: 4, marginTop: 4 },
  footer: { position: "absolute", bottom: 20, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#aaa" },
})

export type CaseReportData = {
  userId: string
  handle: string | null
  displayName: string | null
  email: string | null
  accountStatus: string | null
  statusReason: string | null
  createdAt: string
  balance: number
  owedBalance: number
  isFlagged: boolean
  disputeCount: number
  riskLevel: string
  fraudScore?: number
  patterns?: Array<{ message: string }>
  timeline: Array<{ action: string; created_at: string; actor?: string; severity?: string }>
  transactions: Array<{ type: string; amount: number; created_at: string; reference_id?: string | null }>
  supportHistory: Array<{ issue_type: string; summary: string; outcome: string; created_at: string }>
  notes: Array<{ note: string; created_at: string; admin?: { display_name?: string | null } | null }>
  aiInsight?: string | null
}

function RiskBadge({ level }: { level: string }) {
  const style =
    level === "high" ? styles.badgeHigh :
    level === "medium" ? styles.badgeMedium :
    styles.badgeLow
  return <Text style={[styles.badge, style]}>{level.toUpperCase()}</Text>
}

export function CaseReport({ caseData }: { caseData: CaseReportData }) {
  const generated = new Date().toISOString()

  return (
    <Document>
      <Page style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>1neLink Case Report</Text>
          <Text style={styles.subtitle}>
            Generated: {generated} | User ID: {caseData.userId}
          </Text>
        </View>

        <View style={styles.divider} />

        {/* User Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Information</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{caseData.displayName || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Handle</Text>
            <Text style={styles.value}>{caseData.handle ? `@${caseData.handle}` : "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{caseData.email || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Account Status</Text>
            <Text style={styles.value}>{caseData.accountStatus ?? "active"}{caseData.statusReason ? ` (${caseData.statusReason})` : ""}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Joined</Text>
            <Text style={styles.value}>{new Date(caseData.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Balance</Text>
            <Text style={styles.value}>${caseData.balance.toFixed(2)}</Text>
          </View>
          {caseData.owedBalance > 0 && (
            <View style={styles.row}>
              <Text style={styles.label}>Owed Balance</Text>
              <Text style={[styles.value, { color: "#dc2626" }]}>${caseData.owedBalance.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Flagged</Text>
            <Text style={styles.value}>{caseData.isFlagged ? "Yes" : "No"}</Text>
          </View>
        </View>

        {/* Risk / Fraud */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Risk Analysis</Text>
          <View style={[styles.row, { alignItems: "center", marginBottom: 6 }]}>
            <Text style={styles.label}>Risk Level</Text>
            <RiskBadge level={caseData.riskLevel} />
          </View>
          {caseData.fraudScore != null && (
            <View style={styles.row}>
              <Text style={styles.label}>Fraud Score</Text>
              <Text style={styles.value}>{caseData.fraudScore} / 100</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Disputes</Text>
            <Text style={styles.value}>{caseData.disputeCount}</Text>
          </View>
          {caseData.patterns && caseData.patterns.length > 0 && (
            <View style={{ marginTop: 4 }}>
              <Text style={[styles.label, { marginBottom: 2 }]}>Patterns Detected:</Text>
              {caseData.patterns.map((p, i) => (
                <Text key={i} style={{ paddingLeft: 8, color: "#444", marginBottom: 1 }}>• {p.message}</Text>
              ))}
            </View>
          )}
        </View>

        {/* Activity Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Timeline ({caseData.timeline.length})</Text>
          {caseData.timeline.length === 0 ? (
            <Text style={{ color: "#999" }}>No activity recorded.</Text>
          ) : (
            caseData.timeline.slice(0, 50).map((e, i) => (
              <View key={i} style={styles.eventRow}>
                <Text style={styles.eventTime}>{new Date(e.created_at).toLocaleString()}</Text>
                <Text style={styles.eventAction}>{e.action}{e.actor ? ` (${e.actor})` : ""}</Text>
              </View>
            ))
          )}
          {caseData.timeline.length > 50 && (
            <Text style={{ color: "#999", paddingLeft: 8, marginTop: 2 }}>
              … and {caseData.timeline.length - 50} more events
            </Text>
          )}
        </View>

        {/* Transactions */}
        {caseData.transactions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transactions ({caseData.transactions.length})</Text>
            {caseData.transactions.slice(0, 30).map((tx, i) => (
              <View key={i} style={styles.eventRow}>
                <Text style={styles.eventTime}>{new Date(tx.created_at).toLocaleString()}</Text>
                <Text style={{ width: 80, color: "#444" }}>{tx.type.replace(/_/g, " ")}</Text>
                <Text style={{ color: tx.amount >= 0 ? "#16a34a" : "#dc2626", fontWeight: "bold" }}>
                  {tx.amount >= 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Support History */}
        {caseData.supportHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Support History ({caseData.supportHistory.length})</Text>
            {caseData.supportHistory.map((h, i) => (
              <View key={i} style={{ marginBottom: 4, paddingLeft: 8 }}>
                <Text style={{ color: "#444" }}>
                  {new Date(h.created_at).toLocaleDateString()} — {h.issue_type.replace(/_/g, " ")} [{h.outcome}]
                </Text>
                <Text style={{ color: "#666", paddingLeft: 8 }}>{h.summary}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Internal Notes */}
        {caseData.notes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Internal Notes ({caseData.notes.length})</Text>
            {caseData.notes.map((n, i) => (
              <View key={i} style={{ marginBottom: 4, paddingLeft: 8 }}>
                <Text style={{ color: "#888", fontSize: 8 }}>
                  {new Date(n.created_at).toLocaleString()} — {n.admin?.display_name || "Admin"}
                </Text>
                <Text style={{ color: "#333" }}>{n.note}</Text>
              </View>
            ))}
          </View>
        )}

        {/* AI Insight */}
        {caseData.aiInsight && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Insight</Text>
            <View style={styles.aiBox}>
              <Text style={{ color: "#333" }}>{caseData.aiInsight}</Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>CONFIDENTIAL — Internal Use Only</Text>
          <Text>1neLink Case Report — {generated}</Text>
        </View>
      </Page>
    </Document>
  )
}
