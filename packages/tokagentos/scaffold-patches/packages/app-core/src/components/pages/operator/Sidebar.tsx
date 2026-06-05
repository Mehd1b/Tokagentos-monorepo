/**
 * Operator sidebar — brand lockup, two nav sections (Agent / System), and a
 * wallet chip foot. Ported from handoff_app/prototype/components/Shell.jsx.
 */
import type { ReactNode } from "react";
import { KeyMark } from "./brand/KeyMark";
import { OPERATOR_ADDRESS_SHORT, VAULT_BALANCE } from "./mock";
import type { OperatorPage } from "./OperatorShell";

const NAV_ICONS: Record<OperatorPage, ReactNode> = {
  chat: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  wallet: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h3v-4z" />
    </svg>
  ),
  x402: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9.5a2.5 2 0 0 1 5 0c0 1.5-2.5 1.5-2.5 2.5M14.5 14.5a2.5 2 0 0 1-5 0" />
    </svg>
  ),
  automations: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  plugins: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 3v6M6 21v-6M18 3v6M18 21v-6M3 9h6a3 3 0 0 1 0 6H3M21 9h-6a3 3 0 0 0 0 6h6" />
    </svg>
  ),
  settings: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

interface NavEntry {
  id: OperatorPage;
  label: string;
  badge?: string;
  badgeOk?: boolean;
}

const AGENT_NAV: NavEntry[] = [
  { id: "chat", label: "Chat" },
  { id: "wallet", label: "Wallet" },
  { id: "x402", label: "x402 Credits", badge: "1,284", badgeOk: false },
  { id: "automations", label: "Automations", badge: "3", badgeOk: true },
];

const SYSTEM_NAV: NavEntry[] = [
  { id: "plugins", label: "Plugins" },
  { id: "settings", label: "Settings" },
];

export function Sidebar({
  page,
  setPage,
  brand,
}: {
  page: OperatorPage;
  setPage: (page: OperatorPage) => void;
  brand: ReactNode;
}) {
  const renderNav = (entry: NavEntry) => (
    <button
      type="button"
      key={entry.id}
      className={`nav-item ${page === entry.id ? "is-active" : ""}`}
      onClick={() => setPage(entry.id)}
    >
      <span className="nav-icon">{NAV_ICONS[entry.id]}</span>
      {entry.label}
      {entry.badge && (
        <span className={`nav-badge ${entry.badgeOk ? "ok" : ""}`}>
          {entry.badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="sidebar">
      <div className="sidebar-brand">{brand}</div>

      <div className="sidebar-section-label">Agent</div>
      {AGENT_NAV.map(renderNav)}

      <div className="sidebar-section-label">System</div>
      {SYSTEM_NAV.map(renderNav)}

      <div className="sidebar-foot">
        <div className="wallet-chip">
          <div className="wallet-chip-row">
            <span className="wallet-chip-addr">
              <KeyMark size={14} /> {OPERATOR_ADDRESS_SHORT}
            </span>
            <span className="mode-tag">vault</span>
          </div>
          <div className="wallet-chip-bal">
            <span className="k">PTON balance</span>
            <span className="v">{VAULT_BALANCE.amount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
