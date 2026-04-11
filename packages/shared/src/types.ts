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

export type PaymentStatus = "pending" | "unpaid" | "paid" | "failed" | "refunded";
export type PaymentMethod = "razorpay" | "cash";

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
  email?: string;
  phone?: string;
  password: string;
  qrToken?: string;
}

export interface RegisterRequest {
  email?: string;
  phone?: string;
  password: string;
  role: "customer" | "business";
  qrToken?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  phone?: string | null;
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
  countryCode?: string | null;
  timezone: string;
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
  businessRole?: BusinessRole | null;
}

// ─── Analytics ───────────────────────────────────────────────

export type AnalyticsWindow =
  | "today"
  | "yesterday"
  | "currentWeek"
  | "lastWeek"
  | "lastMonth"
  | "lastQuarter"
  | "lastYear";

export type AnalyticsSource = "postgres" | "warehouse";

export type AnalyticsGranularity = "summary" | "detail";

export type AnalyticsSeriesPoint = {
  bucketStart: string;
  orderCount: number;
  paidRevenue: string;
};

export type ReviewSeriesPoint = {
  bucketStart: string;
  reviewCount: number;
  averageRating: number;
};

export type ReviewAnalyticsSummary = {
  averageRating: number;
  totalReviews: number;
  likesTotal: number;
  likesPerReview: number;
  reviewConversionPct: number | null;
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type ReviewAnalyticsDetail = {
  series: ReviewSeriesPoint[];
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type DashboardAnalyticsSummary = {
  totalOrders: number;
  paidRevenue: string;
  avgPaidOrderValue: string;
  orderGrowthPct?: number | null;
  revenueGrowthPct?: number | null;
  avgItemsPerOrder?: number | null;
  reviews?: ReviewAnalyticsSummary;
};

export type DashboardAnalyticsDetail = {
  ordersSeries: AnalyticsSeriesPoint[];
  revenueSeries: AnalyticsSeriesPoint[];
  newVsReturning?: {
    newCustomers: number;
    returningCustomers: number;
    repeatRatePct?: number | null;
  };
  ordersPerActiveTable?: number | null;
  topCategories?: Array<{
    categoryId: string;
    name: string;
    paidRevenue: string;
    orderCount: number;
  }>;
  topItems?: Array<{
    itemId: string;
    name: string;
    paidRevenue: string;
    orderCount: number;
  }>;
  reviews?: ReviewAnalyticsDetail;
};

export type OrdersAnalyticsSummary = {
  statusCounts: Partial<Record<OrderStatus, number>>;
  avgPrepMinutes?: number | null;
  cancellationRatePct?: number | null;
  paidOrderCount: number;
  unpaidOrderCount: number;
};

export type OrdersAnalyticsDetail = {
  statusSeries: Partial<Record<OrderStatus, AnalyticsSeriesPoint[]>>;
  statusLatencyMinutes?: Partial<Record<OrderStatus, number>>;
  peakHours?: Array<{
    hour: number;
    orderCount: number;
  }>;
  paymentMethodMix?: Array<{
    method: PaymentMethod;
    orderCount: number;
    paidRevenue: string;
  }>;
  failedPaymentCount?: number;
  refundedCount?: number;
};

export type AnalyticsWindowResult = {
  window: AnalyticsWindow;
  source: AnalyticsSource;
  status: "ok" | "error";
  summary?: DashboardAnalyticsSummary | OrdersAnalyticsSummary;
  detail?: DashboardAnalyticsDetail | OrdersAnalyticsDetail;
  error?: string;
};

export type AnalyticsSection = "dashboard" | "orders";

export type AnalyticsSectionResponse = {
  section: AnalyticsSection;
  timezone: string;
  granularity: AnalyticsGranularity;
  windows: Partial<Record<AnalyticsWindow, AnalyticsWindowResult>>;
};

export type AnalyticsSectionRequest = {
  source: AnalyticsSource;
  windows: AnalyticsWindow[];
  granularity: AnalyticsGranularity;
};

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
  createdAt: string;
  orgName?: string | null;
  isOwner?: boolean;
}

export interface OrgInvite {
  id: string;
  orgId: string;
  userId: string;
  status: OrgInviteStatus;
  createdAt: string;
  respondedAt?: string | null;
}

export interface OrgMemberSummary {
  userId: string;
  email: string;
  isOwner: boolean;
}

export interface BusinessMemberSummary {
  businessId: string;
  userId: string;
  email: string;
  role: BusinessRole;
}

export interface BusinessMembership {
  id: string;
  businessId: string;
  userId: string;
  role: BusinessRole;
  createdAt: string;
}

// ─── Reviews ────────────────────────────────────────────────

export type ReviewScope = "recent" | "all";

export type ReviewListItem = {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  likesCount: number;
  likedByCustomer?: boolean;
};

export type ReviewSummary = {
  averageRating: number;
  totalReviews: number;
  ratingCounts: Record<1 | 2 | 3 | 4 | 5, number>;
};

export type ReviewListResponse = {
  reviews: ReviewListItem[];
  summary: ReviewSummary;
  page: number;
  limit: number;
  total: number;
  scope: ReviewScope;
  ratingFilter: number | null;
};

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

export type StatusActorInfo = {
  userId: string | null;
  email: string | null;
};

export type StatusActors = Record<string, StatusActorInfo>;

export type PaymentActors = {
  paidBy?: StatusActorInfo | null;
  paidAt?: string | null;
};

export interface Order {
  id: string;
  businessId: string;
  tableId: string;
  status: OrderStatus;
  totalAmount: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId: string | null;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string | null;
  statusActors?: StatusActors | null;
  paymentActors?: PaymentActors | null;
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

export interface CustomerOrderSummary {
  id: string;
  businessId: string;
  tableId: string;
  status: OrderStatus;
  totalAmount: string;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  createdAt: string;
  updatedAt: string;
  reviewId?: string | null;
  business: { id: string; name: string; currencyCode: string } | null;
}

export interface CustomerOrdersListResponse {
  orders: CustomerOrderSummary[];
  nextCursor: string | null;
}

export interface CreateOrderRequest {
  businessId: string;
  tableId: string;
  customerName: string;
  customerPhone?: string;
  paymentMethod: PaymentMethod;
  items: {
    menuItemId: string;
    quantity: number;
  }[];
}
