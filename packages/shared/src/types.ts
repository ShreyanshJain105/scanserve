// ─── User & Auth ────────────────────────────────────────────

export type UserRole = "customer" | "business" | "admin";

export type BusinessStatus = "pending" | "approved" | "rejected" | "archived";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type OrgRole = "owner" | "manager" | "staff";

export type OrgInviteStatus = "pending" | "accepted" | "declined";

export type BusinessRole = "owner" | "manager" | "staff";

// ─── API Response Shapes ────────────────────────────────────

export interface ApiError {
  code?: string;
  message: string;
}

export interface ApiResponse<T = unknown> {
  status: 1 | 0;
  data?: T;
  error?: ApiError;
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
  qrToken?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: "customer" | "business";
  qrToken?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
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
  currencyCode: string;
  description: string | null;
  logoUrl: string | null;
  address: string;
  phone: string;
  status: BusinessStatus;
  blocked?: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  rejections?: BusinessRejection[];
}

export interface Org {
  id: string;
  ownerUserId: string;
  name?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgMembership {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
}

export interface OrgInvite {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  status: OrgInviteStatus;
  createdAt: string;
  respondedAt?: string | null;
}

export interface BusinessMembership {
  id: string;
  businessId: string;
  userId: string;
  role: BusinessRole;
  createdAt: string;
}

export interface BusinessRejection {
  id: string;
  reason: string | null;
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
  price: string;
  imagePath: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  dietaryTags: string[];
  sortOrder: number;
}

export type BusinessNotificationType =
  | "UPDATE_APPROVED"
  | "UPDATE_REJECTED"
  | "BUSINESS_APPROVED"
  | "BUSINESS_REJECTED"
  | "BUSINESS_BLOCKED"
  | "BUSINESS_UNBLOCKED"
  | "BUSINESS_SUBMITTED"
  | "BUSINESS_UPDATE_SUBMITTED"
  | "ORG_INVITE_RECEIVED"
  | "ORG_INVITE_ACCEPTED"
  | "ORG_INVITE_DECLINED"
  | "BUSINESS_ACCESS_GRANTED";

export interface BusinessNotification {
  id: string;
  inboxId?: string | null;
  businessId: string;
  businessName: string;
  type: BusinessNotificationType;
  message: string;
  actorUserId?: string | null;
  payload?: unknown;
  createdAt: string;
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
  totalAmount: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId: string | null;
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
  unitPrice: string;
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
  }[];
}
