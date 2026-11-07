export type Product = { id: string; name: string; description: string; price: number; category: string; color: string; icon: string; };
export const products: Product[] = [
  { id: "mug", name: "Daybreak ceramic mug", description: "Hand-glazed stoneware for slow mornings.", price: 28, category: "Home goods", color: "#e8d7c4", icon: "☕" },
  { id: "candle", name: "Sunday candle", description: "Cedar, bergamot, and a little quiet.", price: 32, category: "Home goods", color: "#e9cfa8", icon: "✳" },
  { id: "journal", name: "Field notes journal", description: "Recycled paper, ready for your next idea.", price: 18, category: "Stationery", color: "#d5c5b8", icon: "▤" },
  { id: "socks", name: "Soft landing socks", description: "A softer step, knit from organic cotton.", price: 16, category: "Apparel", color: "#ded1db", icon: "〰" },
  { id: "tote", name: "Everyday market tote", description: "Room for the market, the library, and more.", price: 36, category: "Carry", color: "#c8d2bc", icon: "▱" },
  { id: "bottle", name: "Stillwater bottle", description: "Double-wall steel. Keeps its cool all day.", price: 42, category: "Outdoors", color: "#c1d0d1", icon: "◉" },
  { id: "backpack", name: "Transit rolltop pack", description: "Weather-resistant waxed canvas for city commutes.", price: 88, category: "Carry", color: "#c4cbd8", icon: "🎒" },
  { id: "lantern", name: "Campfire solar lantern", description: "Warm ambient glow, solar rechargeable.", price: 45, category: "Outdoors", color: "#e8dcbe", icon: "🏮" },
  { id: "blanket", name: "Heirloom waffle throw", description: "Pure washed linen waffle knit for chilly nights.", price: 64, category: "Home goods", color: "#dec8be", icon: "▦" },
  { id: "pen", name: "Machined brass rollerball", description: "Solid raw brass rollerball with balanced heft.", price: 34, category: "Stationery", color: "#d9d0b4", icon: "✒" },
];
