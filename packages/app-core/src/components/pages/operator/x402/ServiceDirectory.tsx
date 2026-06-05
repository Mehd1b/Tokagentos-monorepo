/**
 * x402 · Service directory — discoverable agent services the treasurer can call.
 * Ported from handoff_app/prototype/components/X402Lower.jsx (ServiceDirectory).
 */
import { SERVICES, type ServiceEntry } from "../mock";

export function ServiceDirectory({
  services = SERVICES,
}: {
  services?: ServiceEntry[];
} = {}) {
  return (
    <>
      <div className="sec-head">
        <div>
          <div className="sec-title">
            <span className="num">DIR</span> Service directory
          </div>
          <div className="sec-sub">
            Discoverable agent services your treasurer can call. Prices are
            per-request in PTON.
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm">
          Browse all 240 ↗
        </button>
      </div>

      <div className="svc-table">
        <div className="svc-row head">
          <span>Service</span>
          <span>Endpoint</span>
          <span>Price</span>
          <span>p50</span>
          <span />
        </div>
        {services.map((s) => (
          <div key={s.name} className="svc-row">
            <div className="svc-name">
              <div className="svc-glyph">{s.glyph}</div>
              <div>
                <div className="svc-name-main">{s.name}</div>
                <div className="svc-name-sub">{s.sub}</div>
              </div>
            </div>
            <span className="svc-endpoint">{s.endpoint}</span>
            <span className="svc-price">
              {s.price}{" "}
              <span style={{ color: "var(--muted)", fontSize: 10 }}>PTON</span>
            </span>
            <span className="svc-latency">{s.latency}</span>
            <button type="button" className="btn btn-ghost btn-sm">
              Connect
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
