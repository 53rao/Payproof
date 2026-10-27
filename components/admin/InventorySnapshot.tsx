import { memo } from "react";
import { products } from "@/lib/products";
import type { DemoState } from "./types";
import { money } from "./format";

export const InventorySnapshot = memo(function InventorySnapshot({ data, loading }: { data: DemoState | null; loading: boolean }) {
  return <section className="pp-screen" id="inventory"><section className="pp-panel pp-inventory"><div className="pp-panel-head"><div><h2>Inventory snapshot</h2><p>Reservations and available units by product</p></div><span className="pp-count">Simulated stock</span></div><div className="pp-inventory-list">{products.map((product) => {
    const available = data?.stock[product.id]; const held = data?.heldStock[product.id]; const sold = data?.committedStock[product.id];
    return <div className="pp-inventory-row" key={product.id}><span className="pp-product-icon" style={{ background: product.color }}>{product.icon}</span><span className="pp-product-name"><b>{product.name}</b><small>{product.category}</small></span><span className="pp-stock-values">{loading && !data ? <span className="pp-inventory-loading">Loading stock…</span> : <><b>{available ?? 0}</b> available <span>·</span> {held ?? 0} held <span>·</span> {sold ?? 0} sold</>}</span><i className="pp-meter"><i style={{ width: `${Math.min(100, (available ?? 0) / 12 * 100)}%` }}/></i><span className={`pp-stock-tag ${(available ?? 0) > 0 ? "in" : "out"}`}>{loading && !data ? "Loading" : (available ?? 0) > 0 ? "In stock" : "Out of stock"}</span><span className="pp-price">{money(product.price)}</span></div>;
  })}</div></section></section>;
});
