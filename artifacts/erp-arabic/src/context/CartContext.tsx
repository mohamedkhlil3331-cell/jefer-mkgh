import { createContext, useContext, useState, ReactNode } from "react";

export interface CartItem {
  productId: number;
  name: string;
  price_per_unit: number;
  price_delivered?: number;
  unit: string;
  image_url?: string;
  category?: string;
  quantity: number;
}

interface CartCtx {
  items: CartItem[];
  totalCount: number;
  addItem: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  removeItem: (productId: number) => void;
  updateQty: (productId: number, qty: number) => void;
  clearCart: () => void;
}

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const totalCount = items.reduce((s, i) => s + i.quantity, 0);

  const addItem = (item: Omit<CartItem, "quantity">, qty = 1) => {
    setItems(prev => {
      const exists = prev.find(i => i.productId === item.productId);
      if (exists) return prev.map(i => i.productId === item.productId ? { ...i, quantity: i.quantity + qty } : i);
      return [...prev, { ...item, quantity: qty }];
    });
  };

  const removeItem = (productId: number) => setItems(prev => prev.filter(i => i.productId !== productId));

  const updateQty = (productId: number, qty: number) => {
    if (qty <= 0) { removeItem(productId); return; }
    setItems(prev => prev.map(i => i.productId === productId ? { ...i, quantity: qty } : i));
  };

  const clearCart = () => setItems([]);

  return <Ctx.Provider value={{ items, totalCount, addItem, removeItem, updateQty, clearCart }}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart outside CartProvider");
  return ctx;
}
