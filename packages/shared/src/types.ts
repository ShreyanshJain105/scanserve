// ─── User & Auth ────────────────────────────────────────────

export type UserRole = "customer" | "business" | "admin";

export type BusinessStatus = "pending" | "approved" | "rejected";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

// ─── API Response Shapes ────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

// ─── Auth ───────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: "customer" | "business";
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

// ─── Business ───────────────────────────────────────────────

export interface BusinessProfile {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  address: string;
  phone: string;
  status: BusinessStatus;
  createdAt: string;
}

// ─── Menu ───────────────────────────────────────────────────

export interface Category {
  id: string;
  businessId: string;
  name: string;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  businessId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  dietaryTags: string[];
  sortOrder: number;
}

// ─── Tables & QR ────────────────────────────────────────────

export interface Table {
  id: string;
  businessId: string;
  tableNumber: number;
  label: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface QrCode {
  id: string;
  businessId: string;
  tableId: string;
  uniqueCode: string;
  qrImageUrl: string | null;
  createdAt: string;
}

// ─── Orders ─────────────────────────────────────────────────

export interface Order {
  id: string;
  businessId: string;
  tableId: string;
  status: OrderStatus;
  totalAmount: number;
  stripePaymentId: string | null;
  paymentStatus: PaymentStatus;
  customerName: string;
  customerPhone: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  specialInstructions: string | null;
}

export interface CreateOrderRequest {
  businessId: string;
  tableId: string;
  customerName: string;
  customerPhone?: string;
  items: {
    menuItemId: string;
    quantity: number;
    specialInstructions?: string;
  }[];
}
