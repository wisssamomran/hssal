import { fieldError } from '@/core/api/http';
import type { ApiResult } from '@/core/api/http';
import type { RefusalCodeText } from '@/core/api/refusal';
import type { InventoryMovement } from './types';

/**
 * A movement of stock, named the way the platform names it.
 *
 * Three of the six kinds are the shelf's own doing; the other three are the market
 * writing itself down. The distinction matters because a seller who is offered
 * "حجز لمشتري" as something to record will use it to fake a sale, and the record is
 * the thing disputes are settled from.
 */
export const MOVEMENT_TYPES = ['IN', 'RESERVED', 'RELEASED', 'SOLD', 'ADJUSTED', 'RETURNED'] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  IN: 'توريد داخل',
  RESERVED: 'حجز لمشتري',
  RELEASED: 'إطلاق حجز',
  SOLD: 'بيع',
  ADJUSTED: 'تسوية جرد',
  RETURNED: 'مرتجع',
};

/**
 * The kinds a seller may record by hand.
 *
 * A reservation, a release and a sale are consequences of a buyer's actions on a
 * hold or a deal — the platform writes those against the offer they changed. What a
 * human is allowed to say about stock is the physical fact: goods arrived, goods came
 * back, or the count on the shelf turned out to be different from the number in the
 * system. That last one is signed, which is why it is the only place a negative
 * quantity belongs.
 */
export const SELLER_RECORDED_TYPES = ['IN', 'ADJUSTED', 'RETURNED'] as const;

export type SellerMovementType = (typeof SELLER_RECORDED_TYPES)[number];

export const SELLER_MOVEMENT_LABELS: Record<SellerMovementType, string> = {
  IN: 'توريد داخل',
  ADJUSTED: 'تسوية جرد (بالزيادة أو النقص)',
  RETURNED: 'مرتجع من مشتري',
};

/** Colour as direction: stock that left the shelf, stock that came back to it. */
export function movementTypeStyle(type: MovementType | string): string {
  if (type === 'SOLD' || type === 'RESERVED') return 'bg-amber-100 text-amber-800';
  if (type === 'IN' || type === 'RETURNED') return 'bg-emerald-50 text-emerald-800';
  return 'bg-slate-100 text-slate-700';
}

export function movementLabel(type: MovementType | string): string {
  return MOVEMENT_LABELS[type as MovementType] ?? String(type);
}

/** What the movement form holds, as typed. */
export interface MovementFormValues {
  offerId: number | '';
  type: SellerMovementType;
  quantity: string;
  reason: string;
}

/**
 * The shelf's own reading of a movement before it is sent.
 *
 * The server (`InventoryMovementController`) requires a non-zero quantity and a
 * reason, and refuses an adjustment that would drive the available count below what
 * is already reserved or sold. What this adds is the sign rule the form's three
 * choices imply: an incoming delivery and a customer return are quantities *added*,
 * so a negative in either box is a mistake, not an instruction. Saying so here keeps
 * a seller from recording a return as a negative delivery and getting the opposite
 * of the correction they intended.
 */
export function movementFieldProblems(values: MovementFormValues): Record<string, string> {
  const problems: Record<string, string> = {};
  const quantity = Number(values.quantity);

  if (values.offerId === '') problems.offer_id = 'اختر العرض الذي تُصحَّح كميته.';
  if (!values.quantity.trim() || Number.isNaN(quantity)) {
    problems.quantity = 'اكتب الكمّية رقمًا.';
  } else if (quantity === 0) {
    problems.quantity = 'الحركة بلا كمية لا تُسجَّل: اكتب رقمًا أكبر من صفر.';
  } else if (quantity < 0 && values.type !== 'ADJUSTED') {
    problems.quantity = 'الوارد والمرتجع كمّية موجبة؛ الإنقاص يكون في «تسوية جرد».';
  }
  // The server only asks for a reason (`required`, 500 characters); three characters
  // is this screen's floor, because "تصحيح" as a note is not something a reviewer
  // reading a dispute file six months later can do anything with.
  if (values.reason.trim().length < 3) problems.reason = 'السبب مطلوب ويُحفظ في السجل.';

  return problems;
}

/** Whether the record button has anything to send. */
export function movementFormIsReady(values: MovementFormValues): boolean {
  return Object.keys(movementFieldProblems(values)).length === 0;
}

/** What `POST /inventory/movements` is sent for a hand-recorded movement. */
export function movementPayload(values: MovementFormValues): {
  offer_id: number;
  type: SellerMovementType;
  quantity: number;
  reason: string;
} {
  return {
    offer_id: Number(values.offerId),
    type: values.type,
    quantity: Number(values.quantity),
    reason: values.reason.trim(),
  };
}

/**
 * What the ledger's refusals ask of the person recording the movement.
 *
 * These are `StockAdjustmentService::adjust()`'s own codes, read off the PHP rather
 * than guessed at: the quantity rules it enforces are the ones the form above also
 * enforces, so a message that arrives here is about the offer — a row that is not
 * this business's, one whose time has passed, or a reduction that would leave less
 * available stock than is already promised to buyers.
 *
 * `TENANT_REQUIRED`, `PERMISSION_DENIED` and `VALIDATION_FAILED` are platform codes
 * and are explained once in `core/api/refusal`.
 */
export const MOVEMENT_REFUSAL_CODES: Record<string, RefusalCodeText> = {
  OFFER_NOT_OWNED: 'العرض المختار ليس من عروض منشأتك؛ اختر عرضاً من القائمة.',
  OFFER_CLOSED: 'هذا العرض منتهٍ أو مسحوب: التزود يُسجَّل على عرض جديد.',
  QUANTITY_INFEASIBLE: 'الإنقاص يترك المتاح أقل من المحجوز أو المبيع; أنقص قليلاً أو أطلق الحجز أولاً.',
  QUANTITY_MUST_BE_POSITIVE: 'الوارد والمرتجع كمّية موجبة; الإنقاص يكون في «تسوية جرد».',
  QUANTITY_REQUIRED: 'الحركة بلا كمية لا تُسجَّل.',
};

/**
 * Which field the ledger's complaint is about.
 *
 * The movement route validates `quantity` and `reason` before the service sees them,
 * so a `VALIDATION_FAILED` answer names the field; the note belongs under that box
 * and nowhere else.
 */
export function movementWriteProblems(result: ApiResult<unknown>): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const field of ['quantity', 'reason', 'offer_id', 'type'] as const) {
    const message = fieldError(result, field);
    if (message) problems[field] = message;
  }
  return problems;
}
