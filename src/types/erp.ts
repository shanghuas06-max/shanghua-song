export type UiLanguage = 'zh' | 'ja' | 'en';
export type DocLanguage = 'en' | 'ja' | 'zh';
export type CurrencyCode = 'USD' | 'JPY' | 'EUR' | 'CNY';

export type TransportMode = 'SEA' | 'AIR' | 'EXPRESS' | 'LAND';

export type IncotermCode =
  | 'EXW'
  | 'FCA'
  | 'FOB'
  | 'CFR'
  | 'CIF'
  | 'CPT'
  | 'CIP'
  | 'DAP'
  | 'DPU'
  | 'DDP';

export type NavSection = 'order' | 'documents' | 'master' | 'history';
export type MasterTab = 'customers' | 'suppliers' | 'logistics' | 'banks' | 'products';
export type DocumentTab = 'invoice' | 'packing' | 'casemark' | 'all';

export interface PriceTier {
  minQty: number;
  maxQty: number | null;
  unitPrice: number;
}

export interface CustomerProductPrice {
  productId: string;
  unitPrice: number;
  tieredPrices?: PriceTier[];
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  country: string;
  address: string;
  contactName: string;
  email: string;
  phone: string;
  fax?: string;
  taxOrImporterId?: string;
  defaultCurrency: CurrencyCode;
  defaultIncoterm: IncotermCode;
  notifyParty?: string;
  customPrices?: CustomerProductPrice[];
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  country: string;
  address: string;
  contactName: string;
  email: string;
  phone: string;
  fax?: string;
  taxOrExporterId: string;
  signatoryName: string;
  signatoryTitle: string;
}

export interface LogisticsProvider {
  id: string;
  code: string;
  name: string;
  supportedModes: TransportMode[];
  contactName: string;
  phone: string;
  email: string;
  accountNo?: string;
  defaultPortOrHub?: string;
}

export interface BankAccount {
  id: string;
  label: string;
  bankName: string;
  branchName: string;
  swiftCode: string;
  accountName: string;
  accountNumber: string;
  currency: CurrencyCode;
  bankAddress: string;
}

export interface Product {
  id: string;
  sku: string;
  nameEn: string;
  nameLocal: string;
  size?: string;
  material?: string;
  surfaceFinish?: string;
  hsCode: string;
  unit: string;
  unitPrice: number;
  currency: CurrencyCode;
  tieredPrices?: PriceTier[];
  unitNetWeightKg: number;
  unitGrossWeightKg: number;
  defaultUnitsPerCarton: number;
  cartonLengthCm: number;
  cartonWidthCm: number;
  cartonHeightCm: number;
  originCountry: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  sku: string;
  description: string;
  size?: string;
  material?: string;
  surfaceFinish?: string;
  hsCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  baseUnitPriceJpy?: number;
  cartons: number;
  unitNetWeightKg: number;
  unitGrossWeightKg: number;
  cartonLengthCm: number;
  cartonWidthCm: number;
  cartonHeightCm: number;
  originCountry: string;
  palletNo?: string;
  cartonRange?: string;
  setsPerCarton?: number;
}

export interface PackingListRow {
  id: string;
  palletNo: string;
  ctnNo: string;
  itemNo: number;
  type: string;
  size: string;
  material: string;
  surfaceFinish: string;
  setsPerCarton: number;
  cartonCount: number;
  sharedCarton?: boolean;
  qty: number;
  unitWeightKg: number;
  totalWeightKg: number;
}

export interface OrderShipping {
  mode: TransportMode;
  logisticsProviderId: string;
  incoterm: IncotermCode;
  incotermPlace: string;
  portOfLoading: string;
  portOfDischarge: string;
  vesselOrFlightOrCourier: string;
  trackingOrBlNo: string;
  etd: string;
  eta: string;
  shippingMarksMain: string;
  caseNumberPrefix: string;
}

export type InsuranceCalcMode = 'MANUAL' | 'AUTO_PERCENT';

export interface OrderCosts {
  packingHandlingCost: number;
  inlandFreightCost: number;
  mainFreightCost: number;
  insuranceMode: InsuranceCalcMode;
  insuranceManualCost: number;
  insuranceRatePercent: number;
  destinationHandlingCost: number;
  importDutyTaxCost: number;
}

export interface ExportOrder {
  id: string;
  invoiceNo: string;
  poNo: string;
  orderDate: string;
  paymentTerms: string;
  currency: CurrencyCode;
  exchangeRate?: number;
  supplierId: string;
  customerId: string;
  billToCustomerId?: string;
  bankAccountId: string;
  itemHeader?: string;
  palletCount?: number;
  emptyCartons?: number;
  cartonsPerLayer?: number;
  palletVolumeDetails?: string;
  surfaceFootnotes?: string;
  packingRows?: PackingListRow[];
  items: OrderItem[];
  shipping: OrderShipping;
  costs: OrderCosts;
  remarks: string;
  updatedAt: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: 'CREATE_ORDER' | 'UPDATE_ORDER' | 'DELETE_ORDER' | 'DUPLICATE_ORDER' | 'MASTER_UPDATE' | 'RESTORE_BACKUP';
  targetLabel: string;
  summary: string;
}

export interface BackupSnapshot {
  id: string;
  createdAt: string;
  reason: string;
  orderCount: number;
  payload: ErpDataPayload;
}

export interface ErpDataPayload {
  version: number;
  exportedAt: string;
  customers: Customer[];
  suppliers: Supplier[];
  logisticsProviders: LogisticsProvider[];
  bankAccounts: BankAccount[];
  products: Product[];
  orders: ExportOrder[];
  auditLogs: AuditLogEntry[];
}

export interface ErpStoreState extends ErpDataPayload {
  activeOrderId: string;
  uiLang: UiLanguage;
  docLang: DocLanguage;
  snapshots: BackupSnapshot[];
}
