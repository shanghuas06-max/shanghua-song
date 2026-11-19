import type { TransportMode, UiLanguage } from '../types/erp';

export interface UiDictionary {
  brandTitle: string;
  brandSub: string;
  navOrder: string;
  navDocuments: string;
  navMaster: string;
  navHistory: string;
  uiLangLabel: string;
  docLangLabel: string;
  btnSaveOrder: string;
  btnNewOrder: string;
  btnPrintDoc: string;
  btnDuplicateOrder: string;
  savedToast: string;
  orderSectionTitle: string;
  orderPartiesTitle: string;
  selectCustomer: string;
  selectSupplier: string;
  selectBank: string;
  invoiceNo: string;
  poNo: string;
  orderDate: string;
  currency: string;
  paymentTerms: string;
  remarks: string;
  itemsSectionTitle: string;
  addProductLabel: string;
  btnAddCustomItem: string;
  colSku: string;
  colDescription: string;
  colHsCode: string;
  colQty: string;
  colUnit: string;
  colUnitPrice: string;
  colCartons: string;
  colWeightKg: string;
  colAmount: string;
  shippingSectionTitle: string;
  transportMode: string;
  modeLabels: Record<TransportMode, string>;
  logisticsProvider: string;
  incotermLabel: string;
  incotermPlace: string;
  portLoading: string;
  portDischarge: string;
  hubOrigin: string;
  hubDestination: string;
  vesselLabel: string;
  flightLabel: string;
  courierLabel: string;
  truckLabel: string;
  blNoLabel: string;
  awbNoLabel: string;
  trackingNoLabel: string;
  waybillNoLabel: string;
  etdLabel: string;
  etaLabel: string;
  shippingMarksMain: string;
  caseNumberPrefix: string;
  calcSectionTitle: string;
  goodsSubtotal: string;
  packingCost: string;
  exwSubtotal: string;
  inlandFreight: string;
  mainFreight: string;
  insuranceMode: string;
  insuranceManual: string;
  insuranceAuto: string;
  insuranceRate: string;
  insuranceCost: string;
  destHandling: string;
  importDuty: string;
  finalTotal: string;
  includedTag: string;
  excludedTag: string;
  totalQty: string;
  totalCartons: string;
  totalNw: string;
  totalGw: string;
  totalCbm: string;
  docTabInvoice: string;
  docTabPacking: string;
  docTabCaseMark: string;
  docTabAll: string;
  docPrintHint: string;
  masterCustomers: string;
  masterSuppliers: string;
  masterLogistics: string;
  masterBanks: string;
  masterProducts: string;
  btnAddRecord: string;
  btnEdit: string;
  btnDelete: string;
  btnSave: string;
  btnCancel: string;
  searchPlaceholder: string;
  historyOrdersTitle: string;
  historyLogsTitle: string;
  historyBackupTitle: string;
  btnLoadOrder: string;
  btnExportBackup: string;
  btnImportBackup: string;
  btnCreateSnapshot: string;
  btnRestoreSnapshot: string;
  btnResetDemo: string;
  backupDesc: string;
  restoreSuccess: string;
  restoreError: string;
  confirmResetTitle: string;
  confirmResetBody: string;
  confirmAction: string;
  emptyItems: string;
  emptyOrders: string;
  localSnapshotsTitle: string;
  ordersUnit: string;
  colInvoiceDate: string;
  colCustomer: string;
  colModeTerm: string;
  colTotal: string;
  colActions: string;
  colCode: string;
  colCustomerName: string;
  colCountry: string;
  colContact: string;
  colDefaults: string;
  colShipperName: string;
  colExporterId: string;
  colSignatory: string;
  colLogisticsName: string;
  colSupportedModes: string;
  colDefaultHub: string;
  colAccountContact: string;
  colBankLabel: string;
  colBankBranch: string;
  colSwift: string;
  colAccountNo: string;
  colProductName: string;
  colNwGw: string;
  colPcsPerCtn: string;
  lblCompanyName: string;
  lblAddress: string;
  lblEmail: string;
  lblPhone: string;
  lblDefaultCurrency: string;
  lblDefaultIncoterm: string;
  lblShipperName: string;
  lblSignatoryName: string;
  lblSignatoryTitle: string;
  lblProviderName: string;
  lblBankName: string;
  lblBranchName: string;
  lblBeneficiary: string;
  lblDescEn: string;
  lblDescLocal: string;
  lblUnitsPerCarton: string;
  lblUnitNw: string;
  lblUnitGw: string;
  authPortalTitle: string;
  authPortalSub: string;
  authTabLogin: string;
  authTabRegister: string;
  authTabReset: string;
  authEmailLabel: string;
  authPasswordLabel: string;
  authConfirmPasswordLabel: string;
  authDisplayNameLabel: string;
  authCompanyNameLabel: string;
  authBtnLogin: string;
  authBtnRegister: string;
  authBtnReset: string;
  authBtnGoogle: string;
  authOrDivider: string;
  authFeatureIsolation: string;
  authFeatureCloudSync: string;
  authFeatureDocs: string;
  authResetSent: string;
  authVerifyTitle: string;
  authVerifyDesc: string;
  authBtnCheckVerified: string;
  authBtnResendVerify: string;
  authVerifyResent: string;
  authVerifyNotYet: string;
  authBtnSignOut: string;
  authWorkspaceLoading: string;
  authCloudSyncedBadge: string;
  authErrInvalidCreds: string;
  authErrEmailInUse: string;
  authErrWeakPass: string;
  authErrPasswordMismatch: string;
  authErrMissingFields: string;
  authErrProviderDisabled: string;
  authErrGeneric: string;
  emptyOrdersWorkspaceTitle: string;
  emptyOrdersWorkspaceDesc: string;
  emptyDocWorkspaceDesc: string;
  lblFax: string;
  lblSize: string;
  lblMaterial: string;
  lblSurfaceFinish: string;
  selectBillTo: string;
  billToSameAsCustomer: string;
  docLayoutSectionTitle: string;
  lblItemHeader: string;
  lblPalletCount: string;
  lblEmptyCartons: string;
  lblPalletVolumeDetails: string;
  lblSurfaceFootnotes: string;
  lblPalletNo: string;
  lblCtnNo: string;
  lblSetsPerCtn: string;
  packingRowsEditorTitle: string;
  packingRowsHint: string;
  btnAutoBuildPackingRows: string;
  btnAddPackingRow: string;
  btnClearPackingRows: string;
  colSharedCtn: string;
  btnImportProducts: string;
  btnDownloadTemplate: string;
  importPreviewTitle: string;
  importPreviewSummary: string;
  importConfirmBtn: string;
  importSuccessToast: string;
  importNoValidRows: string;
  importSkippedErrors: string;
  customPricingTitle: string;
  customPricingHint: string;
  customPricingAddBtn: string;
  customPricingSelectProduct: string;
  customPricingBaseLabel: string;
  customPricingPriceLabel: string;
  customPricingBadge: string;
  customPricingEmpty: string;
  btnExportExcel: string;
  lblTaxOrIdOptional: string;
  lblFaxOptional: string;
  exchangeRateLabel: string;
  exchangeRateHint: string;
  productCurrencyLabel: string;
  tieredPricingTitle: string;
  tieredPricingHint: string;
  tierMinQty: string;
  tierMaxQty: string;
  tierUnitPrice: string;
  tierAddBtn: string;
  tierUnlimited: string;
  tierMatchedBadge: string;
  packingAutoCardTitle: string;
  packingRuleDirect: string;
  packingRulePallet: string;
  cartonsPerLayerLabel: string;
  btnAutoCalcPacking: string;
  jpyBaseUnitLabel: string;
  navSettings: string;
  docTabContract: string;
  settingsTitle: string;
  settingsDesc: string;
  settingsSavedToast: string;
  settingsResetDefaults: string;
  settingsDeliveryLabel: string;
  settingsDeliveryEnLabel: string;
  settingsPackingLabel: string;
  settingsPackingEnLabel: string;
  settingsPaymentLabel: string;
  settingsPaymentEnLabel: string;
  settingsArbitrationLabel: string;
  settingsArbitrationEnLabel: string;
  settingsDisclaimerLabel: string;
  settingsStampLabel: string;
  settingsClausesTitle: string;
  settingsAddClause: string;
  btnSaveSettings: string;
  custTemplatesTitle: string;
  custTemplatesHint: string;
  btnUploadTemplate: string;
  tplNameLabel: string;
  tplScopeLabel: string;
  tplScopeInvoice: string;
  tplScopePacking: string;
  tplScopeContract: string;
  tplScopeAll: string;
  tplStartRowLabel: string;
  tplMappingsTitle: string;
  tplAddMapping: string;
  tplSystemField: string;
  tplTargetRef: string;
  tplDetectedHint: string;
  tplUsingCustomBadge: string;
  tplExportCustomBtn: string;
  tplExportDefaultBtn: string;
  tplBadgeUnit: string;
  docWysiwygHint: string;
  btnResetOverrides: string;
  btnInsertSpecialField: string;
  specialStampLabel: string;
  specialSignatureLabel: string;
  specialDisclaimerLabel: string;
  specialDisclaimerPlaceholder: string;
  specialCustomNoteLabel: string;
  specialCustomNotePlaceholder: string;
  usedPalletsLabel: string;
  palletSpecHint: string;
  btnExportContractDocx: string;
}

export const UI_TEXT: Record<UiLanguage, UiDictionary> = {
  zh: {
    brandTitle: 'HARDLOCK ERP',
    brandSub: '出口单据与报价管理 v3',
    navOrder: '订单与自动计价',
    navDocuments: '单据生成与打印',
    navMaster: '基础资料库',
    navHistory: '历史记录与备份',
    uiLangLabel: '管理界面语言',
    docLangLabel: '出口单据语言',
    btnSaveOrder: '保存订单',
    btnNewOrder: '新建订单',
    btnPrintDoc: '打印出口单据',
    btnDuplicateOrder: '复制为新订单',
    savedToast: '订单已保存并生成自动备份快照',
    orderSectionTitle: '订单基础信息与往来单位',
    orderPartiesTitle: '从基础资料库直接选择客户、供应商与收款银行',
    selectCustomer: '客户 / 收货人 (Consignee)',
    selectSupplier: '出口商 / 供应商 (Shipper)',
    selectBank: '收款银行账户 (Bank)',
    invoiceNo: '发票号 (Invoice No.)',
    poNo: '客户订单号 (PO No.)',
    orderDate: '单据日期',
    currency: '结算币种',
    paymentTerms: '付款方式',
    remarks: '单据备注 (Remarks)',
    itemsSectionTitle: '出口产品明细（自动联动重量、体积与货值）',
    addProductLabel: '从产品库快速添加',
    btnAddCustomItem: '添加空白行',
    colSku: '型号 / SKU',
    colDescription: '品名与规格',
    colHsCode: 'HS编码',
    colQty: '数量',
    colUnit: '单位',
    colUnitPrice: '单价',
    colCartons: '箱数',
    colWeightKg: '净重 / 毛重 (kg)',
    colAmount: '金额',
    shippingSectionTitle: '物流方式与贸易术语 (Incoterms 2020)',
    transportMode: '运输方式',
    modeLabels: {
      SEA: '海运 Sea',
      AIR: '空运 Air',
      EXPRESS: '快递 Express',
      LAND: '陆运 Land',
    },
    logisticsProvider: '物流服务商 (从基础资料选择)',
    incotermLabel: '贸易术语 (Incoterm)',
    incotermPlace: '交货地点 / 目的港',
    portLoading: '起运港 (Port of Loading)',
    portDischarge: '目的港 (Port of Discharge)',
    hubOrigin: '始发站 / 转运中心',
    hubDestination: '目的地城市 / 枢纽',
    vesselLabel: '船名 / 航次 (Vessel/Voyage)',
    flightLabel: '航班号 (Flight No.)',
    courierLabel: '快递渠道 / 服务类型',
    truckLabel: '承运车牌 / 口岸',
    blNoLabel: '提单号 (B/L No.)',
    awbNoLabel: '空运单号 (AWB No.)',
    trackingNoLabel: '快递运单号 (Tracking No.)',
    waybillNoLabel: '陆运单号 (Waybill No.)',
    etdLabel: '预计发运 (ETD)',
    etaLabel: '预计到达 (ETA)',
    shippingMarksMain: '主唛头 (Main Mark)',
    caseNumberPrefix: '箱号前缀',
    calcSectionTitle: '费用联动与自动计价引擎',
    goodsSubtotal: '商品总货值 (Goods Subtotal)',
    packingCost: '包装及出口操作费',
    exwSubtotal: 'EXW 出厂价小计 (自动联动)',
    inlandFreight: '国内拖车与报关费',
    mainFreight: '国际主运费 (海/空/快递/陆运)',
    insuranceMode: '保险计费方式',
    insuranceManual: '固定金额',
    insuranceAuto: '按货值+运费 110% × 费率',
    insuranceRate: '保险费率 (%)',
    insuranceCost: '保险费 (Insurance)',
    destHandling: '目的港操作 / 派送费',
    importDuty: '目的国关税 / 增值税 (DDP)',
    finalTotal: '最终报价总额',
    includedTag: '计入当前术语',
    excludedTag: '不计入当前术语',
    totalQty: '总数量',
    totalCartons: '总箱数',
    totalNw: '总净重 (N.W.)',
    totalGw: '总毛重 (G.W.)',
    totalCbm: '总体积 (CBM)',
    docTabInvoice: '商业发票 (Invoice)',
    docTabPacking: '装箱单 (Packing List)',
    docTabCaseMark: '箱唛标签 (Case Mark)',
    docTabAll: '全套单据联打 (All 3)',
    docPrintHint: '已修复打印样式冲突：点击右侧打印按钮可直接输出标准 A4 纸张单据，管理界面语言与单据语言相互独立。',
    masterCustomers: '客户档案',
    masterSuppliers: '供应商 / 出口方',
    masterLogistics: '物流服务商',
    masterBanks: '银行账户',
    masterProducts: '产品库',
    btnAddRecord: '新增资料',
    btnEdit: '编辑',
    btnDelete: '删除',
    btnSave: '保存更改',
    btnCancel: '取消',
    searchPlaceholder: '输入名称、编码或国家筛选...',
    historyOrdersTitle: '历史出口订单',
    historyLogsTitle: '操作与修改记录',
    historyBackupTitle: '数据持久化与备份恢复',
    btnLoadOrder: '载入编辑',
    btnExportBackup: '导出完整备份 (.json)',
    btnImportBackup: '从备份文件恢复',
    btnCreateSnapshot: '立即创建本地快照',
    btnRestoreSnapshot: '恢复此快照',
    btnResetDemo: '重置为演示数据',
    backupDesc: '浏览器本地存储可长期保留数据，但清除缓存或更换电脑时建议导出 JSON 备份文件。每次保存订单时系统也会自动创建快照。',
    restoreSuccess: '备份数据已成功恢复！',
    restoreError: '备份文件格式无效，请选择由本系统导出的 JSON 文件。',
    confirmResetTitle: '确认重置为初始演示数据？',
    confirmResetBody: '这将清空您当前新增或修改的订单与基础资料。建议先导出 JSON 备份。',
    confirmAction: '确认重置',
    emptyItems: '暂无产品明细，请从上方产品库选择或添加空白行。',
    emptyOrders: '暂无已保存的历史订单。',
    localSnapshotsTitle: '本地自动备份快照',
    ordersUnit: '笔订单',
    colInvoiceDate: '发票号 / 日期',
    colCustomer: '客户名称',
    colModeTerm: '运输方式 · 贸易术语',
    colTotal: '订单总额',
    colActions: '操作',
    colCode: '编码',
    colCustomerName: '客户名称与地址',
    colCountry: '国家/地区',
    colContact: '联系人',
    colDefaults: '默认条款',
    colShipperName: '出口方 / 供应商',
    colExporterId: '出口商/税号',
    colSignatory: '授权签署人',
    colLogisticsName: '物流服务商',
    colSupportedModes: '支持运输方式',
    colDefaultHub: '默认港口 / 转运枢纽',
    colAccountContact: '物流账号 / 电话',
    colBankLabel: '账户简称',
    colBankBranch: '银行与分行',
    colSwift: 'SWIFT 代码',
    colAccountNo: '银行账号',
    colProductName: '产品名称与规格',
    colNwGw: '单件净重 / 毛重',
    colPcsPerCtn: '每箱数量',
    lblCompanyName: '公司全称',
    lblAddress: '详细地址',
    lblEmail: '电子邮箱',
    lblPhone: '联系电话',
    lblDefaultCurrency: '默认币种',
    lblDefaultIncoterm: '默认贸易术语',
    lblShipperName: '出口商 / 供应商名称',
    lblSignatoryName: '签署人姓名',
    lblSignatoryTitle: '签署人职务',
    lblProviderName: '物流公司名称',
    lblBankName: '开户行名称',
    lblBranchName: '支行名称',
    lblBeneficiary: '收款人户名',
    lblDescEn: '英文品名 (用于出口单据)',
    lblDescLocal: '中文 / 日文品名',
    lblUnitsPerCarton: '每箱默认数量',
    lblUnitNw: '单件净重 (kg)',
    lblUnitGw: '单件毛重 (kg)',
    authPortalTitle: '出口管理云端独立工作台',
    authPortalSub: '每位成员拥有独立账号与隔离数据库，支持多设备实时同步订单、基础资料与单据。',
    authTabLogin: '账号登录',
    authTabRegister: '注册独立账号',
    authTabReset: '忘记密码',
    authEmailLabel: '登录邮箱 (账号)',
    authPasswordLabel: '登录密码',
    authConfirmPasswordLabel: '确认密码',
    authDisplayNameLabel: '操作人姓名',
    authCompanyNameLabel: '所属公司 / 部门',
    authBtnLogin: '登录进入系统',
    authBtnRegister: '创建独立账号',
    authBtnReset: '发送重置密码邮件',
    authBtnGoogle: '使用 Google 账号快捷登录',
    authOrDivider: '或',
    authFeatureIsolation: '按账号严格隔离：客户、产品、物流商与订单互不干扰',
    authFeatureCloudSync: '云端实时保存：换电脑或清缓存后登录账号即可恢复',
    authFeatureDocs: '完整单据输出：10种 Incoterms、多运输方式联动与 A4 打印',
    authResetSent: '密码重置邮件已发送，请查收邮箱并按提示重设密码。',
    authVerifyTitle: '请先完成邮箱验证以激活您的独立空间',
    authVerifyDesc: '我们已向以下邮箱发送验证链接，请点击邮件中的确认链接后再点击下方按钮进入系统：',
    authBtnCheckVerified: '我已完成验证，进入系统',
    authBtnResendVerify: '重新发送验证邮件',
    authVerifyResent: '验证邮件已重新发送，请注意查收（含垃圾邮件箱）。',
    authVerifyNotYet: '尚未检测到验证完成，请先点击邮件中的链接后再试。',
    authBtnSignOut: '退出登录',
    authWorkspaceLoading: '正在同步您的独立云端工作台...',
    authCloudSyncedBadge: '云端已同步 · 独立空间',
    authErrInvalidCreds: '邮箱或密码不正确，请核对后重试。',
    authErrEmailInUse: '该邮箱已注册账号，请直接登录或使用忘记密码。',
    authErrWeakPass: '密码强度不足，请设置至少 6 位字符的密码。',
    authErrPasswordMismatch: '两次输入的密码不一致，请检查。',
    authErrMissingFields: '请完整填写邮箱与密码后再提交。',
    authErrProviderDisabled: '当前 Firebase 项目尚未开启「电子邮件/密码」登录方式，请在 Firebase 控制台 Authentication -> Sign-in method 中启用，或先使用 Google 快捷登录。',
    authErrGeneric: '登录验证失败，请稍后重试。',
    emptyOrdersWorkspaceTitle: '暂无出口订单',
    emptyOrdersWorkspaceDesc: '暂无订单，请点击右上角「新建订单」按钮创建第一笔出口订单，或前往「历史记录与备份」恢复已有数据。',
    emptyDocWorkspaceDesc: '暂无订单，请先点击右上角「新建订单」创建订单后再生成商业发票、装箱单与箱唛。',
    lblFax: '传真 (Fax)',
    lblSize: '规格尺寸 (Size)',
    lblMaterial: '材质 (Material)',
    lblSurfaceFinish: '表面处理 (Finish)',
    selectBillTo: '账单抬头 / 买方 (BILL TO)',
    billToSameAsCustomer: '同收货人 (Same as Ship To)',
    docLayoutSectionTitle: '单据扩展字段与托盘装箱编排 (发票 / 装箱单)',
    lblItemHeader: '货物品类总标题 (ITEM Header)',
    lblPalletCount: '托盘总数量 (Pallets)',
    lblEmptyCartons: '空箱补齐数量 (Empty Cartons)',
    lblPalletVolumeDetails: '分托盘体积尺寸明细 (每行一条)',
    lblSurfaceFootnotes: '表面处理说明脚注 (如 *CR3:...)',
    lblPalletNo: '托盘号 (Pallet)',
    lblCtnNo: '箱号段 (Ctn. No.)',
    lblSetsPerCtn: '每箱套数',
    packingRowsEditorTitle: '装箱单托盘/混装行明细 (Packing List Rows)',
    packingRowsHint: '留空时自动按商品明细生成；若需体现「同托盘多规格」或「同一箱内混装(虚线分隔)」，点击自动生成后调整 Pallet No. 与 Ctn. No. 即可。',
    btnAutoBuildPackingRows: '从订单明细生成托盘行',
    btnAddPackingRow: '新增混装行',
    btnClearPackingRows: '恢复自动生成',
    colSharedCtn: '混装',
    btnImportProducts: '导入数据',
    btnDownloadTemplate: '下载导入模板',
    importPreviewTitle: '批量导入产品预览确认',
    importPreviewSummary: '已解析有效产品：{total} 条（新增 {created} 条，更新现有 SKU {updated} 条）',
    importConfirmBtn: '确认批量写入云端',
    importSuccessToast: '已成功批量导入 {count} 条产品资料！',
    importNoValidRows: '未能解析到有效的产品数据，请检查表头及必填字段（产品编号、品名）。',
    importSkippedErrors: '以下行因格式或字段缺失被跳过：',
    customPricingTitle: '专属报价（一客一价）',
    customPricingHint: '为该客户绑定特定产品专属单价。新建订单或选择该客户时，系统将优先自动带出专属价；未绑定产品自动使用产品库基础单价。',
    customPricingAddBtn: '绑定/更新专属价',
    customPricingSelectProduct: '选择产品',
    customPricingBaseLabel: '基础价',
    customPricingPriceLabel: '客户专属单价',
    customPricingBadge: '专属价',
    customPricingEmpty: '暂未绑定专属报价，订单将默认采用产品库基础单价。',
    btnExportExcel: '导出为 Excel',
    lblTaxOrIdOptional: '税号 / 进口商代码 (备填)',
    lblFaxOptional: '传真 Fax (备填)',
    exchangeRateLabel: '汇率 (Exchange Rate)',
    exchangeRateHint: '1 {cur} = {rate} JPY（产品均以日元计价自动换算）',
    productCurrencyLabel: '计价币种 (默认 JPY)',
    tieredPricingTitle: '数量阶梯定价 (JPY)',
    tieredPricingHint: '设置不同订购数量区间对应的日元单价；留空上限表示以上（≥ 最小数量）。',
    tierMinQty: '最小数量 ≥',
    tierMaxQty: '最大数量 ≤ (空=不限)',
    tierUnitPrice: '阶梯单价 (JPY)',
    tierAddBtn: '添加阶梯',
    tierUnlimited: '以上',
    tierMatchedBadge: '阶梯价',
    packingAutoCardTitle: '箱单与托盘自动换算规则',
    packingRuleDirect: '≤ 12 箱：直接使用纸箱包装，无需托盘（0 托盘 · 0 空箱）',
    packingRulePallet: '> 12 箱：每托最多 60 箱；不足一整层部分自动用空箱补足（当前 {cartons} 箱 → {pallets} 托盘 + {empty} 空箱）',
    cartonsPerLayerLabel: '每层箱数',
    btnAutoCalcPacking: '按规则重新换算托盘与空箱',
    jpyBaseUnitLabel: '日元基准价',
    navSettings: '系统设置与合同条款',
    docTabContract: '销售合同 (Contract/PI)',
    settingsTitle: '系统默认合同条款与单据设置',
    settingsDesc: '配置销售合同 (Sales Contract / PI) 的默认付款方式、交货期、包装要求、仲裁条款、公章名称与免责声明模板。支持 {incoterm}、{incotermPlace}、{paymentTerms}、{supplierName} 等动态占位符。',
    settingsSavedToast: '系统设置已保存并同步至云端',
    settingsResetDefaults: '恢复默认条款',
    settingsDeliveryLabel: '默认交货期（中文）',
    settingsDeliveryEnLabel: '默认交货期（英文）',
    settingsPackingLabel: '默认包装要求（中文）',
    settingsPackingEnLabel: '默认包装要求（英文）',
    settingsPaymentLabel: '默认付款方式（中文）',
    settingsPaymentEnLabel: '默认付款方式（英文）',
    settingsArbitrationLabel: '默认仲裁条款（中文）',
    settingsArbitrationEnLabel: '默认仲裁条款（英文）',
    settingsDisclaimerLabel: '默认免责声明模板',
    settingsStampLabel: '电子公章抬头文字',
    settingsClausesTitle: '合同正文标准条款列表（中英双语）',
    settingsAddClause: '新增合同条款',
    btnSaveSettings: '保存系统设置',
    custTemplatesTitle: '客户专属单据模板 (.xlsx / .docx) 与字段映射',
    custTemplatesHint: '上传客户指定的 Excel 或 Word 模板（≤ 330KB），设置系统字段与单元格（如 B10、D20）或 {标签} 的映射。生成单据时系统将自动匹配并套打该客户模板。',
    btnUploadTemplate: '上传单据模板',
    tplNameLabel: '模板名称',
    tplScopeLabel: '适用单据类型',
    tplScopeInvoice: '商业发票 (Invoice)',
    tplScopePacking: '装箱单 (Packing List)',
    tplScopeContract: '销售合同 (Contract/PI)',
    tplScopeAll: '通用全部单据 (All)',
    tplStartRowLabel: '明细起始行号 (Excel 行号)',
    tplMappingsTitle: '字段映射规则',
    tplAddMapping: '新增字段映射',
    tplSystemField: '系统字段',
    tplTargetRef: '模板位置 (如 B10 或 {CLIENT})',
    tplDetectedHint: '已自动识别模板占位符 / 单元格：',
    tplUsingCustomBadge: '已匹配客户专属模板',
    tplExportCustomBtn: '按客户模板导出',
    tplExportDefaultBtn: '导出标准样式 Excel',
    tplBadgeUnit: '个专属模板',
    docWysiwygHint: '所见即所得微调：虚线标注文字可直接点击修改并自动保存；导出 PDF 打印或 Excel 时将完全保留修改内容。',
    btnResetOverrides: '重置微调',
    btnInsertSpecialField: '插入特殊字段',
    specialStampLabel: '插入电子公章 (Company Stamp)',
    specialSignatureLabel: '显示授权手写签名 (Signature)',
    specialDisclaimerLabel: '插入动态免责声明 (Disclaimer)',
    specialDisclaimerPlaceholder: '支持 {invoiceNo} / {orderDate} / {currency} / {incoterm}',
    specialCustomNoteLabel: '追加自定义特殊备注 (Note)',
    specialCustomNotePlaceholder: '输入需印在单据底部的补充说明...',
    usedPalletsLabel: '使用托盘数量 (Pallets)',
    palletSpecHint: '单箱+0.65kg · 单托盘17kg (110×110×14cm = 0.1694m³)',
    btnExportContractDocx: '导出合同 Word (.docx)',
  },
  ja: {
    brandTitle: 'HARDLOCK ERP',
    brandSub: '輸出書類・見積管理システム v3',
    navOrder: '受注・自動見積計算',
    navDocuments: '輸出書類・印刷',
    navMaster: 'マスタデータ管理',
    navHistory: '履歴・バックアップ復元',
    uiLangLabel: '管理画面の言語',
    docLangLabel: '輸出書類の言語',
    btnSaveOrder: '受注データを保存',
    btnNewOrder: '新規受注作成',
    btnPrintDoc: '輸出書類を印刷',
    btnDuplicateOrder: '複製して新規作成',
    savedToast: '受注データを保存し、自動バックアップを作成しました',
    orderSectionTitle: '受注基本情報・取引先選択',
    orderPartiesTitle: 'マスタデータから荷受人・荷送人・振込先銀行を選択',
    selectCustomer: '荷受人 / 顧客 (Consignee)',
    selectSupplier: '輸出者 / 荷送人 (Shipper)',
    selectBank: '受取銀行口座 (Bank)',
    invoiceNo: 'インボイス番号 (Invoice No.)',
    poNo: '注文番号 (PO No.)',
    orderDate: '発行日 (Date)',
    currency: '決済通貨',
    paymentTerms: '支払条件',
    remarks: '備考 (Remarks)',
    itemsSectionTitle: '輸出明細（重量・容積・金額を自動連動）',
    addProductLabel: '製品マスタから追加',
    btnAddCustomItem: '空行を追加',
    colSku: '型番 / SKU',
    colDescription: '品名・仕様',
    colHsCode: 'HSコード',
    colQty: '数量',
    colUnit: '単位',
    colUnitPrice: '単価',
    colCartons: 'ケース数',
    colWeightKg: '正味 / 総重量 (kg)',
    colAmount: '金額',
    shippingSectionTitle: '輸送手段・貿易条件 (Incoterms 2020)',
    transportMode: '輸送モード',
    modeLabels: {
      SEA: '海上輸送',
      AIR: '航空輸送',
      EXPRESS: '国際クーリエ',
      LAND: '陸上輸送',
    },
    logisticsProvider: 'フォワーダー / 物流業者',
    incotermLabel: '貿易条件 (Incoterm)',
    incotermPlace: '引渡地 / 仕向地',
    portLoading: '積出港 (Port of Loading)',
    portDischarge: '荷揚港 (Port of Discharge)',
    hubOrigin: '発送ハブ / 拠点',
    hubDestination: '到着都市 / ハブ',
    vesselLabel: '本船名 / 航海番号',
    flightLabel: '航空便名 (Flight No.)',
    courierLabel: 'クーリエ便種',
    truckLabel: 'トラック便 / 通関地点',
    blNoLabel: 'B/L番号',
    awbNoLabel: 'AWB番号',
    trackingNoLabel: '送り状番号 (Tracking)',
    waybillNoLabel: '運送状番号 (Waybill)',
    etdLabel: '出港予定日 (ETD)',
    etaLabel: '到着予定日 (ETA)',
    shippingMarksMain: 'メインマーク (Main Mark)',
    caseNumberPrefix: 'ケース番号接頭辞',
    calcSectionTitle: '自動連動計算・インコタームズ積算',
    goodsSubtotal: '商品代金小計 (Goods Subtotal)',
    packingCost: '梱包・輸出通関諸掛',
    exwSubtotal: 'EXW 工場渡価格 (自動連動)',
    inlandFreight: '国内輸送・船積費用',
    mainFreight: '国際主運賃 (海/空/クーリエ/陸)',
    insuranceMode: '保険料計算方式',
    insuranceManual: '固定額入力',
    insuranceAuto: '110% × 保険料率 (%)',
    insuranceRate: '保険料率 (%)',
    insuranceCost: '貨物保険料 (Insurance)',
    destHandling: '仕向地取扱・配送費',
    importDuty: '輸入関税・諸税 (DDP)',
    finalTotal: '最終見積合計',
    includedTag: '条件に含む',
    excludedTag: '条件外',
    totalQty: '総数量',
    totalCartons: '総ケース数',
    totalNw: '総正味重量 (N.W.)',
    totalGw: '総重量 (G.W.)',
    totalCbm: '総容積 (CBM)',
    docTabInvoice: 'インボイス (Invoice)',
    docTabPacking: 'パッキングリスト (P/L)',
    docTabCaseMark: 'ケースマーク (Case Mark)',
    docTabAll: '3種一括印刷 (All 3)',
    docPrintHint: '印刷CSSを刷新済みです。管理画面は日本語のまま、輸出書類は英語フォーマット等で個別出力できます。',
    masterCustomers: '顧客マスタ',
    masterSuppliers: '荷送人・自社拠点',
    masterLogistics: '物流業者マスタ',
    masterBanks: '銀行口座マスタ',
    masterProducts: '製品マスタ',
    btnAddRecord: '新規登録',
    btnEdit: '編集',
    btnDelete: '削除',
    btnSave: '保存',
    btnCancel: 'キャンセル',
    searchPlaceholder: '名称・コード・国名で検索...',
    historyOrdersTitle: '受注・書類履歴',
    historyLogsTitle: '変更・操作ログ',
    historyBackupTitle: 'データ保全・バックアップ復元',
    btnLoadOrder: '開く',
    btnExportBackup: 'JSONバックアップ出力',
    btnImportBackup: 'バックアップから復元',
    btnCreateSnapshot: '今すぐスナップショット保存',
    btnRestoreSnapshot: 'この時点へ復元',
    btnResetDemo: '初期デモデータに戻す',
    backupDesc: 'ブラウザ内に保存されますが、キャッシュ削除やPC移行に備えJSONバックアップの出力が可能です。受注保存時に自動スナップショットも記録されます。',
    restoreSuccess: 'バックアップデータを復元しました。',
    restoreError: '無効なバックアップファイルです。本システム出力のJSONを選択してください。',
    confirmResetTitle: '初期データにリセットしますか？',
    confirmResetBody: '現在のマスタおよび受注履歴が初期状態に戻ります。必要に応じ事前にバックアップを出力してください。',
    confirmAction: 'リセット実行',
    emptyItems: '明細がありません。製品マスタから選択するか空行を追加してください。',
    emptyOrders: '保存された受注履歴はありません。',
    localSnapshotsTitle: 'ローカルスナップショット',
    ordersUnit: '件',
    colInvoiceDate: 'インボイス番号 / 日付',
    colCustomer: '顧客名',
    colModeTerm: '輸送手段 · 条件',
    colTotal: '合計金額',
    colActions: '操作',
    colCode: 'コード',
    colCustomerName: '顧客名・住所',
    colCountry: '国・地域',
    colContact: '担当者',
    colDefaults: '初期条件',
    colShipperName: '荷送人 / 輸出者',
    colExporterId: '輸出者ID / 税番',
    colSignatory: '署名者',
    colLogisticsName: '物流業者名',
    colSupportedModes: '対応輸送モード',
    colDefaultHub: '標準港 / ハブ',
    colAccountContact: 'アカウント / 電話',
    colBankLabel: '口座ラベル',
    colBankBranch: '銀行・支店名',
    colSwift: 'SWIFTコード',
    colAccountNo: '口座番号',
    colProductName: '製品名・仕様',
    colNwGw: '単体正味 / 総重量',
    colPcsPerCtn: '入数/箱',
    lblCompanyName: '会社名',
    lblAddress: '住所',
    lblEmail: 'メール',
    lblPhone: '電話番号',
    lblDefaultCurrency: '既定通貨',
    lblDefaultIncoterm: '既定インコタームズ',
    lblShipperName: '輸出者 / 荷送人名',
    lblSignatoryName: '署名者氏名',
    lblSignatoryTitle: '署名者役職',
    lblProviderName: '物流業者名',
    lblBankName: '銀行名',
    lblBranchName: '支店名',
    lblBeneficiary: '受取人名義',
    lblDescEn: '英語品名（書類記載用）',
    lblDescLocal: '日本語 / 現地品名',
    lblUnitsPerCarton: '1ケース入数',
    lblUnitNw: '単体正味重量 (kg)',
    lblUnitGw: '単体総重量 (kg)',
    authPortalTitle: 'クラウド独立輸出ワークスペース',
    authPortalSub: '担当者ごとに独立したアカウントと分離データベースを割り当て、受注・マスタ・書類をリアルタイム同期します。',
    authTabLogin: 'ログイン',
    authTabRegister: '新規アカウント登録',
    authTabReset: 'パスワード再設定',
    authEmailLabel: 'メールアドレス (ID)',
    authPasswordLabel: 'パスワード',
    authConfirmPasswordLabel: 'パスワード確認',
    authDisplayNameLabel: '担当者名',
    authCompanyNameLabel: '会社名 / 部署',
    authBtnLogin: 'ログイン',
    authBtnRegister: '独立アカウントを作成',
    authBtnReset: '再設定メールを送信',
    authBtnGoogle: 'Google アカウントでログイン',
    authOrDivider: 'または',
    authFeatureIsolation: '完全なアカウント分離：顧客・製品・受注データを個別管理',
    authFeatureCloudSync: 'クラウド自動同期：別のPCやブラウザからいつでも復元可能',
    authFeatureDocs: '輸出書類一括作成：Incoterms 2020・4輸送モード・A4印刷対応',
    authResetSent: 'パスワード再設定メールを送信しました。メールをご確認ください。',
    authVerifyTitle: 'メールアドレスの確認を完了してください',
    authVerifyDesc: '確認メールを送信しました。メール内のリンクをクリックした後、下のボタンを押してください：',
    authBtnCheckVerified: '確認完了・システムへ進む',
    authBtnResendVerify: '確認メールを再送信',
    authVerifyResent: '確認メールを再送信しました。',
    authVerifyNotYet: 'まだ確認が完了していません。メール内のリンクをクリックしてから再度お試しください。',
    authBtnSignOut: 'ログアウト',
    authWorkspaceLoading: '独立クラウドワークスペースを読み込み中...',
    authCloudSyncedBadge: 'クラウド同期中 · 独立空間',
    authErrInvalidCreds: 'メールアドレスまたはパスワードが正しくありません。',
    authErrEmailInUse: 'このメールアドレスは既に登録されています。',
    authErrWeakPass: 'パスワードは6文字以上で入力してください。',
    authErrPasswordMismatch: '確認用パスワードが一致しません。',
    authErrMissingFields: 'メールアドレスとパスワードを入力してください。',
    authErrProviderDisabled: 'Firebaseコンソールで「メール/パスワード」認証が有効になっていません。設定を有効にするか、Googleログインをご利用ください。',
    authErrGeneric: '認証エラーが発生しました。もう一度お試しください。',
    emptyOrdersWorkspaceTitle: '受注データがありません',
    emptyOrdersWorkspaceDesc: '受注データがありません。右上の「新規受注作成」ボタンから最初の輸出受注を作成するか、「履歴・バックアップ復元」からデータを復元してください。',
    emptyDocWorkspaceDesc: '輸出書類を作成できる受注データがありません。右上の「新規受注作成」から受注を作成してください。',
    lblFax: 'FAX番号',
    lblSize: 'サイズ (Size)',
    lblMaterial: '材質 (Material)',
    lblSurfaceFinish: '表面処理 (Finish)',
    selectBillTo: '請求先 / 買主 (BILL TO)',
    billToSameAsCustomer: '荷受人と同じ (Same as Ship To)',
    docLayoutSectionTitle: '書類拡張情報・パレット梱包設定 (Invoice / P/L)',
    lblItemHeader: '品目総見出し (ITEM Header)',
    lblPalletCount: 'パレット総数 (Pallets)',
    lblEmptyCartons: '空箱数 (Empty Cartons)',
    lblPalletVolumeDetails: 'パレット別容積・寸法明細 (1行1件)',
    lblSurfaceFootnotes: '表面処理注記 (*CR3:... 等)',
    lblPalletNo: 'パレット番号',
    lblCtnNo: 'カートン番号',
    lblSetsPerCtn: '入数/箱',
    packingRowsEditorTitle: 'パッキングリスト・混載行編集 (Packing List Rows)',
    packingRowsHint: '未設定時は受注明細から自動生成します。混載カートン（点線区切り）やパレット結合を使う場合は自動生成後に番号を調整してください。',
    btnAutoBuildPackingRows: '明細からパレット行を生成',
    btnAddPackingRow: '混載行を追加',
    btnClearPackingRows: '自動生成に戻す',
    colSharedCtn: '混載',
    btnImportProducts: 'データ取込',
    btnDownloadTemplate: '取込テンプレート',
    importPreviewTitle: '製品一括インポート確認',
    importPreviewSummary: '有効データ：{total} 件（新規 {created} 件、既存SKU更新 {updated} 件）',
    importConfirmBtn: 'クラウドへ一括保存',
    importSuccessToast: '{count} 件の製品を一括インポートしました！',
    importNoValidRows: '有効な製品データが見つかりませんでした。列名（SKU・品名）を確認してください。',
    importSkippedErrors: '以下の行はエラーのためスキップされました：',
    customPricingTitle: '顧客別専用単価（一客一価）',
    customPricingHint: 'この顧客向けの特定製品単価を設定します。新規受注または顧客選択時に専用単価を優先適用し、未設定品は製品マスタの標準単価を使用します。',
    customPricingAddBtn: '専用単価を追加/更新',
    customPricingSelectProduct: '製品を選択',
    customPricingBaseLabel: '標準単価',
    customPricingPriceLabel: '顧客専用単価',
    customPricingBadge: '専用単価',
    customPricingEmpty: '専用単価は未設定です（製品マスタの標準単価が適用されます）。',
    btnExportExcel: 'Excel 出力',
    lblTaxOrIdOptional: '税番号 / 輸入者コード (任意)',
    lblFaxOptional: 'FAX番号 (任意)',
    exchangeRateLabel: '為替レート (Exchange Rate)',
    exchangeRateHint: '1 {cur} = {rate} JPY（製品JPY基準単価から自動換算）',
    productCurrencyLabel: '基準通貨 (既定 JPY)',
    tieredPricingTitle: '数量別段階単価 (JPY)',
    tieredPricingHint: '数量範囲ごとのJPY単価を設定します（上限空欄＝以上）。',
    tierMinQty: '最小数量 ≥',
    tierMaxQty: '最大数量 ≤ (空=上限なし)',
    tierUnitPrice: '段階単価 (JPY)',
    tierAddBtn: '段階を追加',
    tierUnlimited: '以上',
    tierMatchedBadge: '段階単価',
    packingAutoCardTitle: 'カートン・パレット自動換算ルール',
    packingRuleDirect: '12箱以下：パレット不使用（0 パレット · 空箱 0）',
    packingRulePallet: '12箱超：1パレット最大60箱・最上段の端数は空箱補充（現在 {cartons}箱 → {pallets}パレット + 空箱{empty}）',
    cartonsPerLayerLabel: '1段あたり箱数',
    btnAutoCalcPacking: 'ルールに基づき再計算',
    jpyBaseUnitLabel: 'JPY基準単価',
    navSettings: 'システム設定・契約条項',
    docTabContract: '売買契約書 (Contract/PI)',
    settingsTitle: '契約書既定条項・書類システム設定',
    settingsDesc: '売買契約書・PI の支払条件、納期、梱包要件、仲裁条項、社印名、免責事項を設定します。{incoterm} や {paymentTerms} 等の変数を利用できます。',
    settingsSavedToast: 'システム設定をクラウドへ保存しました',
    settingsResetDefaults: '既定条項に戻す',
    settingsDeliveryLabel: '既定納期・発送期限（中国語）',
    settingsDeliveryEnLabel: '既定納期・発送期限（英語）',
    settingsPackingLabel: '既定梱包要件（中国語）',
    settingsPackingEnLabel: '既定梱包要件（英語）',
    settingsPaymentLabel: '既定支払条件（中国語）',
    settingsPaymentEnLabel: '既定支払条件（英語）',
    settingsArbitrationLabel: '既定仲裁条項（中国語）',
    settingsArbitrationEnLabel: '既定仲裁条項（英語）',
    settingsDisclaimerLabel: '既定免責事項テンプレート',
    settingsStampLabel: '電子社印タイトル',
    settingsClausesTitle: '契約条項リスト（中英バイリンガル）',
    settingsAddClause: '条項を追加',
    btnSaveSettings: 'システム設定を保存',
    custTemplatesTitle: '顧客専用帳票テンプレート (.xlsx / .docx)',
    custTemplatesHint: '顧客指定の Excel / Word テンプレート（≤ 330KB）を登録し、システム項目をセル番地（例: B10）または {タグ} にマッピングします。',
    btnUploadTemplate: 'テンプレートをアップロード',
    tplNameLabel: 'テンプレート名',
    tplScopeLabel: '対象書類',
    tplScopeInvoice: 'インボイス (Invoice)',
    tplScopePacking: 'パッキングリスト (P/L)',
    tplScopeContract: '売買契約書 (Contract/PI)',
    tplScopeAll: '全書類共通 (All)',
    tplStartRowLabel: '明細開始行 (Excel 行番号)',
    tplMappingsTitle: '項目マッピング',
    tplAddMapping: 'マッピング追加',
    tplSystemField: 'システム項目',
    tplTargetRef: 'セル / タグ (例: B10)',
    tplDetectedHint: '検出されたタグ / セル：',
    tplUsingCustomBadge: '顧客専用テンプレート適用中',
    tplExportCustomBtn: '顧客テンプレート出力',
    tplExportDefaultBtn: '標準スタイル Excel 出力',
    tplBadgeUnit: '件の専用テンプレート',
    docWysiwygHint: 'プレビュー上の破線箇所はクリックして直接編集できます。編集内容は印刷PDFとExcel出力の両方に反映されます。',
    btnResetOverrides: '微調整をリセット',
    btnInsertSpecialField: '特殊項目を挿入',
    specialStampLabel: '社印を挿入 (Company Stamp)',
    specialSignatureLabel: '署名を表示 (Signature)',
    specialDisclaimerLabel: '動的免責事項を挿入 (Disclaimer)',
    specialDisclaimerPlaceholder: '{invoiceNo} / {orderDate} / {currency} / {incoterm} が利用可能',
    specialCustomNoteLabel: 'カスタム特記事項 (Note)',
    specialCustomNotePlaceholder: '書類下部に印刷する追加注記を入力...',
    usedPalletsLabel: '使用パレット数 (Pallets)',
    palletSpecHint: '箱+0.65kg · パレット17kg (110×110×14cm = 0.1694m³)',
    btnExportContractDocx: '契約書 Word (.docx) 出力',
  },
  en: {
    brandTitle: 'HARDLOCK ERP',
    brandSub: 'Export Operations & Docs v3',
    navOrder: 'Order & Auto-Calc',
    navDocuments: 'Documents & Print',
    navMaster: 'Master Data',
    navHistory: 'History & Backup',
    uiLangLabel: 'Management UI Language',
    docLangLabel: 'Export Document Language',
    btnSaveOrder: 'Save Order',
    btnNewOrder: 'New Order',
    btnPrintDoc: 'Print Documents',
    btnDuplicateOrder: 'Duplicate Order',
    savedToast: 'Order saved with automatic backup snapshot',
    orderSectionTitle: 'Order Header & Parties',
    orderPartiesTitle: 'Select registered Customer, Shipper, and Bank from Master Data',
    selectCustomer: 'Consignee / Customer',
    selectSupplier: 'Shipper / Exporter',
    selectBank: 'Remittance Bank Account',
    invoiceNo: 'Invoice No.',
    poNo: 'Customer PO No.',
    orderDate: 'Order Date',
    currency: 'Currency',
    paymentTerms: 'Payment Terms',
    remarks: 'Document Remarks',
    itemsSectionTitle: 'Line Items (Linked Weight, CBM & Value)',
    addProductLabel: 'Add from Product Catalog',
    btnAddCustomItem: 'Add Blank Row',
    colSku: 'SKU / Part No.',
    colDescription: 'Description',
    colHsCode: 'HS Code',
    colQty: 'Qty',
    colUnit: 'Unit',
    colUnitPrice: 'Unit Price',
    colCartons: 'Cases',
    colWeightKg: 'N.W. / G.W. (kg)',
    colAmount: 'Amount',
    shippingSectionTitle: 'Shipping Mode & Incoterms 2020',
    transportMode: 'Transport Mode',
    modeLabels: {
      SEA: 'Sea Freight',
      AIR: 'Air Cargo',
      EXPRESS: 'Express',
      LAND: 'Land Freight',
    },
    logisticsProvider: 'Logistics Provider',
    incotermLabel: 'Incoterm 2020',
    incotermPlace: 'Named Place / Port',
    portLoading: 'Port of Loading',
    portDischarge: 'Port of Discharge',
    hubOrigin: 'Origin Hub / Facility',
    hubDestination: 'Destination City / Hub',
    vesselLabel: 'Vessel / Voyage',
    flightLabel: 'Flight No.',
    courierLabel: 'Courier Service',
    truckLabel: 'Truck / Border Crossing',
    blNoLabel: 'B/L No.',
    awbNoLabel: 'MAWB / HAWB No.',
    trackingNoLabel: 'Tracking / Waybill No.',
    waybillNoLabel: 'CMR / Waybill No.',
    etdLabel: 'ETD',
    etaLabel: 'ETA',
    shippingMarksMain: 'Main Shipping Mark',
    caseNumberPrefix: 'Case No. Prefix',
    calcSectionTitle: 'Linked Auto-Calculation Engine',
    goodsSubtotal: 'Goods Subtotal',
    packingCost: 'Export Packing & Handling',
    exwSubtotal: 'EXW Subtotal (Auto-Linked)',
    inlandFreight: 'Inland Freight & Clearance',
    mainFreight: 'Main Freight (Sea/Air/Express/Land)',
    insuranceMode: 'Insurance Calculation',
    insuranceManual: 'Fixed Amount',
    insuranceAuto: '110% Insured Value × Rate %',
    insuranceRate: 'Rate (%)',
    insuranceCost: 'Cargo Insurance',
    destHandling: 'Destination Handling / Delivery',
    importDuty: 'Import Duty & Tax (DDP)',
    finalTotal: 'Final Incoterm Total',
    includedTag: 'Included',
    excludedTag: 'Excluded',
    totalQty: 'Total Qty',
    totalCartons: 'Total Cases',
    totalNw: 'Total Net Weight',
    totalGw: 'Total Gross Weight',
    totalCbm: 'Total Volume (CBM)',
    docTabInvoice: 'Commercial Invoice',
    docTabPacking: 'Packing List',
    docTabCaseMark: 'Case Mark',
    docTabAll: 'Print All 3 Docs',
    docPrintHint: 'Print CSS renders clean A4 sheets independently of management UI language.',
    masterCustomers: 'Customers',
    masterSuppliers: 'Shippers',
    masterLogistics: 'Logistics',
    masterBanks: 'Banks',
    masterProducts: 'Products',
    btnAddRecord: 'Add Record',
    btnEdit: 'Edit',
    btnDelete: 'Delete',
    btnSave: 'Save',
    btnCancel: 'Cancel',
    searchPlaceholder: 'Filter by name, code, or country...',
    historyOrdersTitle: 'Saved Export Orders',
    historyLogsTitle: 'Revision Audit Log',
    historyBackupTitle: 'Data Persistence & Backup',
    btnLoadOrder: 'Open in Editor',
    btnExportBackup: 'Export JSON Backup',
    btnImportBackup: 'Restore from JSON',
    btnCreateSnapshot: 'Create Snapshot Now',
    btnRestoreSnapshot: 'Restore',
    btnResetDemo: 'Reset Demo Data',
    backupDesc: 'Data persists in your browser. Export JSON backups before clearing browser storage or migrating PCs.',
    restoreSuccess: 'Backup restored successfully.',
    restoreError: 'Invalid backup file format.',
    confirmResetTitle: 'Reset to factory demo data?',
    confirmResetBody: 'This will replace all current orders and master data with initial sample records.',
    confirmAction: 'Confirm Reset',
    emptyItems: 'No items yet. Select a product above or add a blank row.',
    emptyOrders: 'No saved orders in history.',
    localSnapshotsTitle: 'Local Snapshots',
    ordersUnit: 'orders',
    colInvoiceDate: 'Invoice / Date',
    colCustomer: 'Customer',
    colModeTerm: 'Mode · Term',
    colTotal: 'Total',
    colActions: 'Actions',
    colCode: 'Code',
    colCustomerName: 'Customer Name',
    colCountry: 'Country',
    colContact: 'Contact',
    colDefaults: 'Defaults',
    colShipperName: 'Shipper / Exporter',
    colExporterId: 'Exporter ID',
    colSignatory: 'Signatory',
    colLogisticsName: 'Logistics Provider',
    colSupportedModes: 'Supported Modes',
    colDefaultHub: 'Default Port / Hub',
    colAccountContact: 'Account / Contact',
    colBankLabel: 'Account Label',
    colBankBranch: 'Bank & Branch',
    colSwift: 'SWIFT',
    colAccountNo: 'Account No.',
    colProductName: 'Product Name',
    colNwGw: 'N.W. / G.W.',
    colPcsPerCtn: 'Pcs / Ctn',
    lblCompanyName: 'Company Name',
    lblAddress: 'Address',
    lblEmail: 'Email',
    lblPhone: 'Phone',
    lblDefaultCurrency: 'Default Currency',
    lblDefaultIncoterm: 'Default Incoterm',
    lblShipperName: 'Shipper / Exporter Name',
    lblSignatoryName: 'Signatory Name',
    lblSignatoryTitle: 'Signatory Title',
    lblProviderName: 'Provider Name',
    lblBankName: 'Bank Name',
    lblBranchName: 'Branch Name',
    lblBeneficiary: 'Beneficiary Name',
    lblDescEn: 'Description (English)',
    lblDescLocal: 'Local Description (JP/CN)',
    lblUnitsPerCarton: 'Units / Carton',
    lblUnitNw: 'Unit Net Weight (kg)',
    lblUnitGw: 'Unit Gross Weight (kg)',
    authPortalTitle: 'Isolated Cloud Export Workspace',
    authPortalSub: 'Every operator gets a private account and isolated cloud database for orders, master data, and A4 export documents.',
    authTabLogin: 'Sign In',
    authTabRegister: 'Create Account',
    authTabReset: 'Reset Password',
    authEmailLabel: 'Email Address',
    authPasswordLabel: 'Password',
    authConfirmPasswordLabel: 'Confirm Password',
    authDisplayNameLabel: 'Operator Name',
    authCompanyNameLabel: 'Company / Department',
    authBtnLogin: 'Sign In to Workspace',
    authBtnRegister: 'Create Private Account',
    authBtnReset: 'Send Reset Link',
    authBtnGoogle: 'Continue with Google',
    authOrDivider: 'or',
    authFeatureIsolation: 'Strict tenant isolation per account across all master data & orders',
    authFeatureCloudSync: 'Real-time cloud persistence across browsers and computers',
    authFeatureDocs: 'Incoterms 2020 auto-calc, multi-mode logistics & clean A4 print',
    authResetSent: 'Password reset email sent. Check your inbox for instructions.',
    authVerifyTitle: 'Verify Your Email to Unlock Your Workspace',
    authVerifyDesc: 'A verification link has been sent to the email below. Click the link, then continue:',
    authBtnCheckVerified: 'I Have Verified — Enter ERP',
    authBtnResendVerify: 'Resend Verification Email',
    authVerifyResent: 'Verification email sent again.',
    authVerifyNotYet: 'Email is not verified yet. Please click the link in your inbox first.',
    authBtnSignOut: 'Sign Out',
    authWorkspaceLoading: 'Syncing your isolated cloud workspace...',
    authCloudSyncedBadge: 'Cloud Synced · Isolated',
    authErrInvalidCreds: 'Invalid email or password.',
    authErrEmailInUse: 'An account with this email already exists.',
    authErrWeakPass: 'Password must be at least 6 characters.',
    authErrPasswordMismatch: 'Passwords do not match.',
    authErrMissingFields: 'Please enter both email and password.',
    authErrProviderDisabled: 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication -> Sign-in method). Enable it or sign in with Google.',
    authErrGeneric: 'Authentication failed. Please try again.',
    emptyOrdersWorkspaceTitle: 'No Export Orders Yet',
    emptyOrdersWorkspaceDesc: 'No orders found. Click "New Order" in the top-right bar to create your first export order, or restore a backup from History & Backup.',
    emptyDocWorkspaceDesc: 'No active order available. Click "New Order" in the top-right bar before generating commercial invoices, packing lists, or case marks.',
    lblFax: 'Fax',
    lblSize: 'Size',
    lblMaterial: 'Material',
    lblSurfaceFinish: 'Surface Finish',
    selectBillTo: 'BILL TO (Buyer / Payer)',
    billToSameAsCustomer: 'Same as Ship-To Customer',
    docLayoutSectionTitle: 'Document Header & Pallet Packing Layout',
    lblItemHeader: 'ITEM Category Header',
    lblPalletCount: 'Total Pallets',
    lblEmptyCartons: 'Empty Cartons',
    lblPalletVolumeDetails: 'Pallet Volume & Dimensions (one per line)',
    lblSurfaceFootnotes: 'Surface Finish Footnotes (*CR3:...)',
    lblPalletNo: 'Pallet No.',
    lblCtnNo: 'Ctn. No.',
    lblSetsPerCtn: 'Sets / Ctn',
    packingRowsEditorTitle: 'Packing List Pallet & Mixed-Carton Rows',
    packingRowsHint: 'Auto-generated from line items when empty. Click auto-build to customize pallet merges or shared mixed-carton rows.',
    btnAutoBuildPackingRows: 'Build from Line Items',
    btnAddPackingRow: 'Add Packing Row',
    btnClearPackingRows: 'Use Auto Rows',
    colSharedCtn: 'Mixed',
    btnImportProducts: 'Import Data',
    btnDownloadTemplate: 'Download Template',
    importPreviewTitle: 'Confirm Bulk Product Import',
    importPreviewSummary: 'Parsed {total} valid products ({created} new, {updated} updating existing SKUs)',
    importConfirmBtn: 'Import to Cloud Catalog',
    importSuccessToast: 'Imported {count} products to catalog!',
    importNoValidRows: 'No valid product rows found. Please check required SKU and Name columns.',
    importSkippedErrors: 'Skipped rows due to missing/invalid fields:',
    customPricingTitle: 'Customer-Specific Pricing',
    customPricingHint: 'Bind custom unit prices per product for this customer. New orders and customer switches prioritize these prices over base catalog pricing.',
    customPricingAddBtn: 'Add / Update Price',
    customPricingSelectProduct: 'Select Product',
    customPricingBaseLabel: 'Base',
    customPricingPriceLabel: 'Customer Unit Price',
    customPricingBadge: 'Custom Price',
    customPricingEmpty: 'No custom prices configured. Base catalog unit prices apply by default.',
    btnExportExcel: 'Export to Excel',
    lblTaxOrIdOptional: 'Tax / Importer ID (Optional)',
    lblFaxOptional: 'Fax (Optional)',
    exchangeRateLabel: 'Exchange Rate',
    exchangeRateHint: '1 {cur} = {rate} JPY (auto-converted from JPY base pricing)',
    productCurrencyLabel: 'Base Currency (Default JPY)',
    tieredPricingTitle: 'Quantity Tiered Pricing (JPY)',
    tieredPricingHint: 'Define unit prices per quantity range. Leave max blank for open-ended tiers.',
    tierMinQty: 'Min Qty ≥',
    tierMaxQty: 'Max Qty ≤ (blank=∞)',
    tierUnitPrice: 'Tier Price (JPY)',
    tierAddBtn: 'Add Tier',
    tierUnlimited: '+',
    tierMatchedBadge: 'Tier',
    packingAutoCardTitle: 'Carton & Pallet Auto-Conversion',
    packingRuleDirect: '≤ 12 cartons: Direct carton packing without pallets (0 pallets · 0 empty)',
    packingRulePallet: '> 12 cartons: Max 60/pallet; incomplete top layer filled with empty cartons ({cartons} ctns → {pallets} pallets + {empty} empty)',
    cartonsPerLayerLabel: 'Cartons / Layer',
    btnAutoCalcPacking: 'Recalculate Pallets & Empty',
    jpyBaseUnitLabel: 'JPY Base',
    navSettings: 'Settings & Contract Clauses',
    docTabContract: 'Contract / PI',
    settingsTitle: 'Default Contract Clauses & System Settings',
    settingsDesc: 'Configure default Payment Terms, Delivery Time, Packing, Arbitration, Stamp Label, and Disclaimer text for Sales Contracts / PI. Supports placeholders like {incoterm}, {incotermPlace}, and {paymentTerms}.',
    settingsSavedToast: 'System settings saved and synced to cloud',
    settingsResetDefaults: 'Reset Defaults',
    settingsDeliveryLabel: 'Default Delivery Time (ZH)',
    settingsDeliveryEnLabel: 'Default Delivery Time (EN)',
    settingsPackingLabel: 'Default Packing Clause (ZH)',
    settingsPackingEnLabel: 'Default Packing Clause (EN)',
    settingsPaymentLabel: 'Default Payment Clause (ZH)',
    settingsPaymentEnLabel: 'Default Payment Clause (EN)',
    settingsArbitrationLabel: 'Default Arbitration Clause (ZH)',
    settingsArbitrationEnLabel: 'Default Arbitration Clause (EN)',
    settingsDisclaimerLabel: 'Default Disclaimer Template',
    settingsStampLabel: 'Company Stamp Label',
    settingsClausesTitle: 'Bilingual Contract Clauses',
    settingsAddClause: 'Add Clause',
    btnSaveSettings: 'Save Settings',
    custTemplatesTitle: 'Customer Document Templates (.xlsx / .docx)',
    custTemplatesHint: 'Upload customer-specific Excel or Word templates (≤ 330KB) and map system fields to cell references (e.g. B10) or {tag} placeholders.',
    btnUploadTemplate: 'Upload Template',
    tplNameLabel: 'Template Name',
    tplScopeLabel: 'Document Scope',
    tplScopeInvoice: 'Commercial Invoice',
    tplScopePacking: 'Packing List',
    tplScopeContract: 'Contract / PI',
    tplScopeAll: 'All Documents',
    tplStartRowLabel: 'Items Start Row (Excel)',
    tplMappingsTitle: 'Field Mappings',
    tplAddMapping: 'Add Mapping',
    tplSystemField: 'System Field',
    tplTargetRef: 'Target Cell / Tag (e.g. B10)',
    tplDetectedHint: 'Detected placeholders / cells:',
    tplUsingCustomBadge: 'Customer Template Matched',
    tplExportCustomBtn: 'Export Customer Template',
    tplExportDefaultBtn: 'Export Styled Excel',
    tplBadgeUnit: 'templates',
    docWysiwygHint: 'WYSIWYG Inline Editing: Click any dashed field below to edit directly. Changes persist to both Print/PDF and Excel exports.',
    btnResetOverrides: 'Reset Edits',
    btnInsertSpecialField: 'Insert Special Field',
    specialStampLabel: 'Company Stamp (SVG Seal)',
    specialSignatureLabel: 'Authorized Signature',
    specialDisclaimerLabel: 'Dynamic Disclaimer',
    specialDisclaimerPlaceholder: 'Supports {invoiceNo} / {orderDate} / {currency} / {incoterm}',
    specialCustomNoteLabel: 'Custom Footer Note',
    specialCustomNotePlaceholder: 'Enter custom remark to append at bottom...',
    usedPalletsLabel: 'Used Pallets',
    palletSpecHint: '+0.65kg/ctn · +17kg/pallet (110×110×14cm = 0.1694m³)',
    btnExportContractDocx: 'Export Contract (.docx)',
  },
};
