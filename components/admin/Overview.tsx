import { Incidents } from "./Incidents";

export function Overview({ error }: { error: string }) {
  return <section id="overview" className="pp-screen pp-overview-screen" aria-labelledby="pp-network-overview-title">
    <div className="pp-hero"><div className="pp-title"><h1 id="pp-network-overview-title">Network Overview</h1></div></div>
    {error && <div className="pp-error" role="alert">{error}</div>}
    <Incidents/>
  </section>;
}
