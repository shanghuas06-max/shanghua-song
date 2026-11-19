import type {
  ContractClauseItem,
  ContractSettings,
  CurrencyCode,
  ExportOrder,
  Supplier,
} from '../types/erp';

const ONES = [
  '',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
];

const TENS = [
  '',
  '',
  'TWENTY',
  'THIRTY',
  'FORTY',
  'FIFTY',
  'SIXTY',
  'SEVENTY',
  'EIGHTY',
  'NINETY',
];

const SCALES = ['', 'THOUSAND', 'MILLION', 'BILLION'];

function threeDigitsToWords(num: number): string {
  const n = Math.floor(num);
  if (n === 0) return '';
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} HUNDRED`);
  }
  if (rem > 0) {
    if (rem < 20) {
      parts.push(ONES[rem]);
    } else {
      const ten = Math.floor(rem / 10);
      const one = rem % 10;
      parts.push(one > 0 ? `${TENS[ten]}-${ONES[one]}` : TENS[ten]);
    }
  }
  return parts.join(' ');
}

function integerToEnglishWords(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return 'ZERO';
  let remaining = Math.floor(n);
  const chunks: string[] = [];
  let scaleIdx = 0;

  while (remaining > 0 && scaleIdx < SCALES.length) {
    const chunk = remaining % 1000;
    if (chunk > 0) {
      const word = threeDigitsToWords(chunk);
      chunks.unshift(SCALES[scaleIdx] ? `${word} ${SCALES[scaleIdx]}` : word);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIdx += 1;
  }

  return chunks.join(' ');
}

const CURRENCY_UNIT_NAMES: Record<
  CurrencyCode,
  { major: string; minor: string; prefix: string }
> = {
  JPY: { major: 'JAPANESE YEN', minor: 'SEN', prefix: 'JPY ' },
  USD: { major: 'US DOLLARS', minor: 'CENTS', prefix: 'USD ' },
  EUR: { major: 'EUROS', minor: 'CENTS', prefix: 'EUR ' },
  CNY: { major: 'CHINESE YUAN (RMB)', minor: 'FEN', prefix: 'CNY ' },
};

export function numberToContractWords(
  amount: number,
  currency: CurrencyCode,
): string {
  const safe = Math.max(0, Number.isFinite(amount) ? amount : 0);
  const meta = CURRENCY_UNIT_NAMES[currency];
  if (currency === 'JPY') {
    const whole = Math.round(safe);
    return `${meta.prefix}${integerToEnglishWords(whole)} ${meta.major} ONLY.`;
  }
  const roundedCents = Math.round(safe * 100);
  const whole = Math.floor(roundedCents / 100);
  const cents = roundedCents % 100;
  const wholeWords = integerToEnglishWords(whole);
  if (cents > 0) {
    const centWords = integerToEnglishWords(cents);
    return `${meta.prefix}${wholeWords} ${meta.major} AND ${centWords} ${meta.minor} ONLY.`;
  }
  return `${meta.prefix}${wholeWords} ${meta.major} ONLY.`;
}

export function createDefaultContractSettings(): ContractSettings {
  const defaultDeliveryTime =
    '卖方确认买方按照以下付款方式办好电汇手续后，将于 5 个工作日内发货。';
  const defaultDeliveryTimeEn =
    'SHIPMENT WILL BE WITHIN 5 WORKING DAYS AFTER CONFIRMATION OF COMPLETION OF THE PAYMENT PROCEDURES BY THE BUYER.';
  const defaultPackingClause =
    '以坚固的箱子包装，适于远距离海运/空运，能够防潮、防震，并能抵抗气候变化。对于不妥当的包装而引起的货物生锈和损失，其责任应由卖方承担。';
  const defaultPackingClauseEn =
    'TO BE PACKED IN STRONG CASE(S), SUITABLE FOR LONG DISTANCE OCEAN / AIR TRANSPORTATION AND CLIMATE CHANGING AND RESISTANT TO MOISTURE AND SHOCKS. THE SELLERS SHALL BE LIABLE FOR ANY DAMAGE OR LOSS OF THE GOODS CAUSED BY IMPROPER PACKING OR RUST ATTRIBUTABLE TO INADEQUATE PROTECTIVE MEASURES IN PACKING.';
  const defaultPaymentClause = '发货前买方以电汇方式全款预付给卖方。({paymentTerms})';
  const defaultPaymentClauseEn =
    'THE BUYER SHALL MAKE THE PAYMENT FOR THE FULL AMOUNT BY TELEGRAPHIC TRANSFER TO THE SELLER BEFORE SHIPMENT. ({paymentTerms})';
  const defaultArbitrationClause =
    '凡有关执行合同所发生的一切争议，双方应通过友好协商解决，双方如协商不能解决时，此争议应提交设在大阪的一般社团法人日本商事仲裁协会，按照该协会的商事仲裁规则进行仲裁。仲裁在大阪进行，仲裁协会的裁决为最终裁决，双方均受其约束，仲裁费用由败诉一方负责。';
  const defaultArbitrationClauseEn =
    'ALL DISPUTES IN CONNECTION WITH THIS CONTRACT OR THE EXECUTION THEREOF SHALL BE SETTLED BY FRIENDLY NEGOTIATION. IF NO SETTLEMENT CAN BE REACHED, THE CASE IN DISPUTE SHALL BE SUBMITTED TO THE JAPAN COMMERCIAL ARBITRATION ASSOCIATION IN OSAKA IN ACCORDANCE WITH THE COMMERCIAL ARBITRATION RULES BY THE ARBITRATION ASSOCIATION. THE ARBITRATION SHALL TAKE PLACE IN OSAKA, JAPAN, ADJUDICATION MADE BY THE ARBITRATION ASSOCIATION SHALL BE ACCEPTED AS FINAL AND BINDING UPON BOTH PARTIES, ARBITRATION FEE SHALL BE BORNE BY THE LOSING PARTY.';

  const clauses: ContractClauseItem[] = [
    {
      id: 'clause-1',
      number: 1,
      titleZh: '贸易条款和条件',
      titleEn: 'INCOTERMS',
      bodyZh: '{incoterm} {incotermPlace}',
      bodyEn: '{incoterm} {incotermPlace}',
    },
    {
      id: 'clause-2',
      number: 2,
      titleZh: '包装',
      titleEn: 'PACKING',
      bodyZh: defaultPackingClause,
      bodyEn: defaultPackingClauseEn,
    },
    {
      id: 'clause-3',
      number: 3,
      titleZh: '产地及厂商',
      titleEn: 'COUNTRY OF ORIGIN AND MANUFACTURER',
      bodyZh: '{originCountry}，{supplierName}',
      bodyEn: '{originCountry}, {supplierName}',
    },
    {
      id: 'clause-4',
      number: 4,
      titleZh: '保险',
      titleEn: 'INSURANCE',
      bodyZh: '买方或按贸易术语约定承担空运或海运期间的一切运输风险。',
      bodyEn:
        'CARGO INSURANCE SHALL BE COVERED IN ACCORDANCE WITH THE AGREED INCOTERMS 2020 ({incoterm}) DURING AIR OR SEA TRANSPORTATION.',
    },
    {
      id: 'clause-5',
      number: 5,
      titleZh: '发货期限',
      titleEn: 'TIME OF SHIPMENT',
      bodyZh: defaultDeliveryTime,
      bodyEn: defaultDeliveryTimeEn,
    },
    {
      id: 'clause-6',
      number: 6,
      titleZh: '付款方式',
      titleEn: 'PAYMENT TERMS',
      bodyZh: defaultPaymentClause,
      bodyEn: defaultPaymentClauseEn,
    },
    {
      id: 'clause-7',
      number: 7,
      titleZh: '索赔',
      titleEn: 'CLAIMS',
      bodyZh:
        '在货物到达买方指定地点后30天内，买方需实施货物检验。如发现货物品质、规格或数量与合同规定不符时，买方需在3个工作日内将此问题通过书面形式告知卖方。如卖方认定此问题属于卖方的问题，卖方会根据实际情况，实施包括换货等相应处理。',
      bodyEn:
        'WITHIN 30 DAYS AFTER THE ARRIVAL OF THE GOODS AT THE DESTINATION, THE BUYER SHALL CONDUCT THE INCOMING INSPECTION. IF THERE IS DISCREPANCY IN THE SPECIFICATION, QUALITY AND/OR QUANTITY WITH THE STIPULATIONS OF THE CONTRACT, THE BUYERS SHALL NOTIFY THE SELLER IN WRITING WITHIN 3 WORKING DAYS, THE SELLER SHALL TAKE PROPER MEASURES INCLUDING REPLACEMENT OF THE GOODS AT ONE’S OWN EXPENSE IN ACCORDANCE WITH THE ACTUAL CIRCUMSTANCES IF THE INCONFORMITY IS JUDGED TO BE RESPONSIBLE FOR THE SELLER.',
    },
    {
      id: 'clause-8',
      number: 8,
      titleZh: '质量保证',
      titleEn: 'GUARANTEE OF QUALITY',
      bodyZh:
        '卖方保证货物由本合同中规定的材料制成，全新，未曾用过，并完全符合本合同规定的质量、规格和性能。',
      bodyEn:
        'THE SELLERS SHALL GUARANTEE THAT THE GOODS ARE MADE OF MATERIALS WHICH ARE STIPULATED IN THIS CONTRACT, WITH FIRST CLASS WORKMANSHIP, BRAND NEW, UNUSED AND CORRESPOND IN ALL RESPECTS WITH THE QUALITY, SPECIFICATIONS AND PERFORMANCE AS STIPULATED IN THIS CONTRACT.',
    },
    {
      id: 'clause-9',
      number: 9,
      titleZh: '不可抗力',
      titleEn: 'FORCE MAJEURE',
      bodyZh:
        '卖方对在设备制造及运输期间由不可抗力而引起的延迟交货或不能交货不负任何责任，不可抗力因常指在出现了战争、火灾、地震、台风、自然灾害等卖方所不能合理控制的情况而阻止或干扰了本合同的履行时，卖方应立即通知买方所发生的不可抗力。',
      bodyEn:
        'THE SELLER SHALL NOT BE RESPONSIBLE FOR THE DELAY IN SHIPMENT OR NON-DELIVERY OF THE GOODS DUE TO FORCE MAJEURE, WHICH MIGHT OCCUR DURING THE PROCESS OF MANUFACTURING OR IN THE COURSE OF LOADING OR TRANSIT, SUCH AS WAR, FIRE, FLOOD, EARTHQUAKE, TYPHOON, NATURAL CATASTROPHE THAT BEYOND THE SELLERS’ REASONABLE CONTROL PREVENTING, HINDERING OR INTERFERING WITH THE PERFORMANCE THEREOF. THE SELLERS SHALL ADVISE THE BUYERS IMMEDIATELY.',
    },
    {
      id: 'clause-10',
      number: 10,
      titleZh: '仲裁与仲裁地点',
      titleEn: 'ARBITRATION & PLACE OF ARBITRATION',
      bodyZh: defaultArbitrationClause,
      bodyEn: defaultArbitrationClauseEn,
    },
    {
      id: 'clause-11',
      number: 11,
      titleZh: '银行费用',
      titleEn: 'BANKING CHARGES',
      bodyZh:
        '所有在买方所在国境外发生的银行费用由卖方承担，所有在买方所在国境内发生的银行费用由买方承担。',
      bodyEn:
        'ALL THE BANKING CHARGES INCURRED OUTSIDE THE BUYER’S COUNTRY SHALL BE BORNE BY THE SELLERS; ALL THE BANKING CHARGES INCURRED INSIDE THE BUYER’S COUNTRY SHALL BE BORNE BY THE BUYERS.',
    },
    {
      id: 'clause-12',
      number: 12,
      titleZh: '合同生效与语言',
      titleEn: 'CONTRACT EFFECTIVENESS & LANGUAGE',
      bodyZh: '本合同自买卖双方签署之日起生效。中英文具有同等法律效力。',
      bodyEn:
        'THIS CONTRACT COMES INTO FORCE RIGHT AFTER SIGNATURE BY BOTH THE BUYERS AND THE SELLERS. BOTH THE ENGLISH AND CHINESE HAVE SAME FORCE EFFECT.',
    },
  ];

  return {
    defaultDeliveryTime,
    defaultDeliveryTimeEn,
    defaultPackingClause,
    defaultPackingClauseEn,
    defaultPaymentClause,
    defaultPaymentClauseEn,
    defaultArbitrationClause,
    defaultArbitrationClauseEn,
    defaultDisclaimerText:
      'Seller → Buyer transaction value only ({invoiceNo} / {orderDate} / {incoterm}). Any typographical amendments must be countersigned by both parties.',
    companyStampLabel: 'HARDLOCK Industry Co., Ltd.',
    companyStampImage: '',
    signatureImage: '',
    clauses,
  };
}

export function interpolateContractText(
  template: string,
  order: ExportOrder,
  supplier?: Supplier,
): string {
  const originCountry = (
    order.items[0]?.originCountry ||
    supplier?.country ||
    'JAPAN'
  ).toUpperCase();
  const incotermPlace = (
    order.shipping.incotermPlace ||
    order.shipping.portOfDischarge ||
    ''
  ).toUpperCase();

  return String(template ?? '')
    .replace(/\{invoiceNo\}/g, order.invoiceNo || '—')
    .replace(/\{poNo\}/g, order.poNo || '—')
    .replace(/\{orderDate\}/g, order.orderDate || '—')
    .replace(/\{currency\}/g, order.currency || 'JPY')
    .replace(/\{incoterm\}/g, order.shipping.incoterm || 'FOB')
    .replace(/\{incotermPlace\}/g, incotermPlace)
    .replace(/\{paymentTerms\}/g, order.paymentTerms || 'T/T IN ADVANCE')
    .replace(/\{originCountry\}/g, originCountry)
    .replace(
      /\{supplierName\}/g,
      supplier?.name || 'HARDLOCK Industry Co., Ltd.',
    );
}
