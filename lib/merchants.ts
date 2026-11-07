export type DemoMerchant = {
  id: string;
  name: string;
  email: string;
  defaultPassword: string;
  products: string[];
};

export const DEMO_MERCHANTS: DemoMerchant[] = [
  {
    id: "northstar",
    name: "Northstar Goods",
    email: "northstar@payproof.demo",
    defaultPassword: "northstar123",
    products: ["mug", "candle"],
  },
  {
    id: "fieldform",
    name: "Field & Form",
    email: "fieldform@payproof.demo",
    defaultPassword: "fieldform123",
    products: ["journal", "socks"],
  },
  {
    id: "apex",
    name: "Apex Outpost",
    email: "apex@payproof.demo",
    defaultPassword: "apex123",
    products: ["tote", "bottle"],
  },
  {
    id: "beacon",
    name: "Beacon Supply",
    email: "beacon@payproof.demo",
    defaultPassword: "beacon123",
    products: ["backpack", "lantern"],
  },
  {
    id: "solis",
    name: "Solis Studio",
    email: "solis@payproof.demo",
    defaultPassword: "solis123",
    products: ["blanket", "pen"],
  },
];

export const PRODUCT_TO_MERCHANT_ID: Record<string, string> = {
  mug: "northstar",
  candle: "northstar",
  journal: "fieldform",
  socks: "fieldform",
  tote: "apex",
  bottle: "apex",
  backpack: "beacon",
  lantern: "beacon",
  blanket: "solis",
  pen: "solis",
};

export const PRODUCT_TO_MERCHANT_NAME: Record<string, string> = {
  mug: "Northstar Goods",
  candle: "Northstar Goods",
  journal: "Field & Form",
  socks: "Field & Form",
  tote: "Apex Outpost",
  bottle: "Apex Outpost",
  backpack: "Beacon Supply",
  lantern: "Beacon Supply",
  blanket: "Solis Studio",
  pen: "Solis Studio",
};

export function getMerchantForProduct(productId: string) {
  const merchantId = PRODUCT_TO_MERCHANT_ID[productId] ?? "northstar";
  return DEMO_MERCHANTS.find((m) => m.id === merchantId) ?? DEMO_MERCHANTS[0];
}
