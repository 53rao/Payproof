export type Product = { id: string; name: string; description: string; price: number; category: string; color: string; icon: string; };
export const products: Product[] = [
  { id: "mug", name: "Daybreak ceramic mug", description: "Hand-glazed stoneware for slow mornings.", price: 28, category: "Home goods", color: "#e8d7c4", icon: "☕" },
  { id: "tote", name: "Everyday market tote", description: "Room for the market, the library, and more.", price: 36, category: "Carry", color: "#c8d2bc", icon: "▱" },
  { id: "candle", name: "Sunday candle", description: "Cedar, bergamot, and a little quiet.", price: 32, category: "Home goods", color: "#e9cfa8", icon: "✳" },
  { id: "journal", name: "Field notes journal", description: "Recycled paper, ready for your next idea.", price: 18, category: "Stationery", color: "#d5c5b8", icon: "▤" },
  { id: "bottle", name: "Stillwater bottle", description: "Double-wall steel. Keeps its cool all day.", price: 42, category: "Outdoors", color: "#c1d0d1", icon: "◉" },
  { id: "socks", name: "Soft landing socks", description: "A softer step, knit from organic cotton.", price: 16, category: "Apparel", color: "#ded1db", icon: "〰" },
];
