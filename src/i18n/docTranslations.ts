import type { DocLanguage, TransportMode } from '../types/erp';

export interface DocDictionary {
  commercialInvoice: string;
  packingList: string;
  caseMarkSheet: string;
  shipperExporter: string;
  consignee: string;
  notifyParty: string;
  invoiceNo: string;
  date: string;
  poNo: string;
  paymentTerms: string;
  tradeTerms: string;
  transportMode: string;
  modeNames: Record<TransportMode, string>;
  logisticsCarrier: string;
  portOfLoading: string;
  portOfDischarge: string;
  carrierRef: string;
  docNumberRef: string;
  etdEta: string;
  countryOfOrigin: string;
  marksAndNumbers: string;
  descriptionOfGoods: string;
  hsCode: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  goodsSubtotal: string;
  packingHandling: string;
  exwValue: string;
  inlandClearance: string;
  mainFreight: string;
  insurance: string;
  destHandling: string;
  importDuty: string;
  totalAmount: string;
  remittanceBank: string;
  bankName: string;
  swiftCode: string;
  accountName: string;
  accountNo: string;
  authorizedSignature: string;
  caseNo: string;
  netWeight: string;
  grossWeight: string;
  measurement: string;
  totalPackages: string;
  remarks: string;
  madeIn: string;
  destination: string;
  fragileKeepDry: string;
}

export const DOC_TEXT: Record<DocLanguage, DocDictionary> = {
  en: {
    commercialInvoice: 'COMMERCIAL INVOICE',
    packingList: 'PACKING LIST',
    caseMarkSheet: 'SHIPPING CASE MARK',
    shipperExporter: 'SHIPPER / EXPORTER',
    consignee: 'CONSIGNEE / BUYER',
    notifyParty: 'NOTIFY PARTY',
    invoiceNo: 'Invoice No.',
    date: 'Invoice Date',
    poNo: 'Customer P/O No.',
    paymentTerms: 'Payment Terms',
    tradeTerms: 'Trade Terms (Incoterms 2020)',
    transportMode: 'Mode of Transport',
    modeNames: {
      SEA: 'OCEAN FREIGHT',
      AIR: 'AIR CARGO',
      EXPRESS: 'INTERNATIONAL EXPRESS COURIER',
      LAND: 'LAND FREIGHT / TRUCKING',
    },
    logisticsCarrier: 'Forwarder / Carrier',
    portOfLoading: 'Port / Place of Loading',
    portOfDischarge: 'Port / Place of Discharge',
    carrierRef: 'Vessel / Flight / Service',
    docNumberRef: 'B/L / AWB / Tracking No.',
    etdEta: 'ETD / ETA',
    countryOfOrigin: 'Country of Origin',
    marksAndNumbers: 'Marks & Numbers',
    descriptionOfGoods: 'Description of Goods & Part No.',
    hsCode: 'HS Code',
    quantity: 'Quantity',
    unitPrice: 'Unit Price',
    amount: 'Amount',
    goodsSubtotal: 'Subtotal (Goods Value)',
    packingHandling: 'Export Packing & Handling',
    exwValue: 'Total EXW Value',
    inlandClearance: 'Inland Freight & Export Clearance',
    mainFreight: 'International Freight',
    insurance: 'Cargo Insurance',
    destHandling: 'Destination Handling / Delivery',
    importDuty: 'Import Duties & Taxes',
    totalAmount: 'TOTAL INVOICE VALUE',
    remittanceBank: 'BANK REMITTANCE DETAILS',
    bankName: 'Bank / Branch',
    swiftCode: 'SWIFT / BIC',
    accountName: 'Beneficiary',
    accountNo: 'Account No.',
    authorizedSignature: 'Signed by Authorized Representative',
    caseNo: 'Case No.',
    netWeight: 'Net Weight (kg)',
    grossWeight: 'Gross Weight (kg)',
    measurement: 'Measurement (CBM)',
    totalPackages: 'TOTAL PACKAGES & WEIGHT',
    remarks: 'Remarks / Certification',
    madeIn: 'MADE IN',
    destination: 'DESTINATION',
    fragileKeepDry: 'HANDLE WITH CARE · KEEP DRY · DO NOT DROP',
  },
  ja: {
    commercialInvoice: 'COMMERCIAL INVOICE（商業送り状）',
    packingList: 'PACKING LIST（梱包明細書）',
    caseMarkSheet: 'CASE MARK（荷印・ケースマーク）',
    shipperExporter: '輸出者 / 荷送人 (SHIPPER)',
    consignee: '荷受人 / 買主 (CONSIGNEE)',
    notifyParty: '着荷通知先 (NOTIFY PARTY)',
    invoiceNo: 'インボイス番号',
    date: '発行日',
    poNo: '注文番号 (P/O No.)',
    paymentTerms: '支払条件',
    tradeTerms: '貿易条件 (Incoterms 2020)',
    transportMode: '輸送手段',
    modeNames: {
      SEA: '海上輸送 (SEA FREIGHT)',
      AIR: '航空輸送 (AIR CARGO)',
      EXPRESS: '国際宅配便 (EXPRESS COURIER)',
      LAND: '陸上輸送 (LAND FREIGHT)',
    },
    logisticsCarrier: '利用フォワーダー / 輸送業者',
    portOfLoading: '積出地 / 積出港',
    portOfDischarge: '仕向地 / 荷揚港',
    carrierRef: '本船名 / 便名 / サービス',
    docNumberRef: 'B/L / AWB / 送り状番号',
    etdEta: '出港予定 / 到着予定',
    countryOfOrigin: '原産国',
    marksAndNumbers: '荷印・ケース番号',
    descriptionOfGoods: '品名・型番・仕様',
    hsCode: 'HSコード',
    quantity: '数量',
    unitPrice: '単価',
    amount: '金額',
    goodsSubtotal: '商品代金小計',
    packingHandling: '梱包・輸出取扱費',
    exwValue: 'EXW 工場渡金額',
    inlandClearance: '国内輸送・通関費',
    mainFreight: '国際主運賃',
    insurance: '貨物保険料',
    destHandling: '仕向地諸掛・配送費',
    importDuty: '輸入関税・諸税',
    totalAmount: 'インボイス合計金額',
    remittanceBank: '振込先銀行情報',
    bankName: '銀行・支店名',
    swiftCode: 'SWIFTコード',
    accountName: '受取人名義',
    accountNo: '口座番号',
    authorizedSignature: '輸出者署名 (Authorized Signature)',
    caseNo: 'ケース番号',
    netWeight: '正味重量 (kg)',
    grossWeight: '総重量 (kg)',
    measurement: '容積 (CBM)',
    totalPackages: '総梱包数・総重量',
    remarks: '備考・特記事項',
    madeIn: '原産国 / MADE IN',
    destination: '仕向地 / DESTINATION',
    fragileKeepDry: '取扱注意 · 水濡厳禁 · 転倒厳禁',
  },
  zh: {
    commercialInvoice: 'COMMERCIAL INVOICE（商业发票）',
    packingList: 'PACKING LIST（装箱单）',
    caseMarkSheet: 'CASE MARK（外箱唛头标签）',
    shipperExporter: '发货人 / 出口商 (SHIPPER)',
    consignee: '收货人 / 买方 (CONSIGNEE)',
    notifyParty: '通知方 (NOTIFY PARTY)',
    invoiceNo: '发票号码',
    date: '发票日期',
    poNo: '采购单号 (P/O No.)',
    paymentTerms: '付款条件',
    tradeTerms: '贸易术语 (Incoterms 2020)',
    transportMode: '运输方式',
    modeNames: {
      SEA: '海运 (OCEAN FREIGHT)',
      AIR: '空运 (AIR CARGO)',
      EXPRESS: '国际快递 (EXPRESS COURIER)',
      LAND: '陆运 (LAND FREIGHT)',
    },
    logisticsCarrier: '承运物流商',
    portOfLoading: '起运港 / 始发地',
    portOfDischarge: '目的港 / 目的地',
    carrierRef: '船名航次 / 航班 / 快递渠道',
    docNumberRef: '提单号 / 运单号',
    etdEta: '预计开航 / 到达',
    countryOfOrigin: '原产国',
    marksAndNumbers: '唛头与箱号',
    descriptionOfGoods: '货物描述与规格型号',
    hsCode: 'HS 编码',
    quantity: '数量',
    unitPrice: '单价',
    amount: '总金额',
    goodsSubtotal: '货物总价小计',
    packingHandling: '出口包装及操作费',
    exwValue: 'EXW 出厂价总额',
    inlandClearance: '国内拖车与报关费',
    mainFreight: '国际主运费',
    insurance: '货物运输保险费',
    destHandling: '目的港操作及派送费',
    importDuty: '目的国关税及增值税',
    totalAmount: '发票结算总额',
    remittanceBank: '收款银行账户信息',
    bankName: '银行与分行',
    swiftCode: 'SWIFT 代码',
    accountName: '收款人户名',
    accountNo: '银行账号',
    authorizedSignature: '授权代表签章 (Authorized Signature)',
    caseNo: '箱号 (Case No.)',
    netWeight: '净重 (kg)',
    grossWeight: '毛重 (kg)',
    measurement: '体积 (CBM)',
    totalPackages: '总箱数与总重量汇总',
    remarks: '备注说明',
    madeIn: '原产地 / MADE IN',
    destination: '目的地 / DESTINATION',
    fragileKeepDry: '小心轻放 · 防潮防湿 · 切勿倒置',
  },
};
