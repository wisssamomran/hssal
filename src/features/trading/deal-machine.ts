/**
 * The order's state machine, as the web sees it.
 *
 * Every table here mirrors a rule the backend already enforces — the comments
 * name the PHP they come from — and none of them decides anything. They exist so
 * a screen can draw the moves a person is actually allowed to make instead of
 * handing them a button whose only purpose is to be refused. The server re-decides
 * every transition, including whether this actor is the buyer or the seller of
 * *this* order, and the scan of the delivery code — not this file — is what lets
 * an order be closed.
 *
 * This module is deliberately free of React, of the API client and of any language:
 * it is the domain, and a screen composes it. Keeping it apart is also what makes
 * it checkable — the same rules can be read against `DealStateMachineService`
 * without a browser, and a second client can mirror them from one place.
 */
import type { Deal, DealStatus } from './types';

/**
 * The path an order walks, drawn as a track.
 *
 * It is the machine's own forward line, with the two short-cuts left out of the
 * picture rather than denied: `ACCEPTED → DISPATCHED` and
 * `DELIVERED → COMPLETED` are legal moves the buttons offer, and drawing every
 * legal edge would turn a straight line into a web nobody can read.
 */
export const FULFILMENT_STEPS: DealStatus[] = [
  'PENDING_SELLER_APPROVAL',
  'ACCEPTED',
  'PROCESSING',
  'READY_FOR_PICKUP',
  'DISPATCHED',
  'DELIVERED',
  'INSPECTION',
  'COMPLETED',
];

/**
 * Mirrors `DealStateMachineService::ALLOWED_TRANSITIONS` so the screen offers the
 * moves that exist.
 */
export const NEXT_STATES: Partial<Record<DealStatus, DealStatus[]>> = {
  DRAFT: ['PENDING_SELLER_APPROVAL', 'CANCELLED'],
  PENDING_SELLER_APPROVAL: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PROCESSING', 'READY_FOR_PICKUP', 'DISPATCHED', 'CANCELLED', 'DISPUTED'],
  PROCESSING: ['READY_FOR_PICKUP', 'DISPATCHED', 'CANCELLED', 'DISPUTED'],
  READY_FOR_PICKUP: ['DELIVERED', 'CANCELLED', 'DISPUTED'],
  DISPATCHED: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['INSPECTION', 'COMPLETED', 'DISPUTED'],
  INSPECTION: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  DISPUTED: ['RESOLVED'],
  RESOLVED: ['COMPLETED', 'CANCELLED'],
  CANCELLED: [],
};

/**
 * Who may make each move, and what the move asserts — the web's copy of
 * `DealStateMachineService::TRANSITION_RULES`.
 *
 * The route cannot express this and neither can a permission list, because
 * `deals.confirm` is held by a buyer's owner and a seller's owner alike, and the
 * same endpoint serves both. What separates them is which side of *this* order
 * their organization sits on, and that is a fact about the row, not about the
 * session.
 */
export const ACTOR_RULES: Partial<Record<DealStatus, Array<'buyer' | 'seller'>>> = {
  PENDING_SELLER_APPROVAL: ['buyer'],
  ACCEPTED: ['seller'],
  PROCESSING: ['seller'],
  READY_FOR_PICKUP: ['seller'],
  DISPATCHED: ['seller'],
  DELIVERED: ['seller'],
  INSPECTION: ['buyer'],
  COMPLETED: ['buyer'],
  DISPUTED: ['buyer', 'seller'],
  CANCELLED: ['buyer', 'seller'],
  // RESOLVED is a platform ruling, and it is made on the disputes screen.
};

/**
 * The permission each target state requires, mirroring
 * `DealController::TRANSITION_PERMISSIONS`. Display courtesy again, never an
 * entitlement: the middleware is what enforces it.
 */
export const STATE_PERMISSIONS: Partial<Record<DealStatus, string>> = {
  PENDING_SELLER_APPROVAL: 'deals.confirm',
  ACCEPTED: 'deals.confirm',
  PROCESSING: 'deals.dispatch',
  READY_FOR_PICKUP: 'deals.dispatch',
  DISPATCHED: 'deals.dispatch',
  DELIVERED: 'deals.dispatch',
  INSPECTION: 'deals.confirm',
  COMPLETED: 'deals.confirm',
  DISPUTED: 'deals.dispute',
  CANCELLED: 'deals.confirm',
};

/** The states at which a delivery code may be scanned, from `HANDOVER_ELIGIBLE_STATUSES`. */
export const HANDOVER_ELIGIBLE: DealStatus[] = ['DELIVERED', 'INSPECTION', 'DISPUTED', 'RESOLVED'];

/**
 * Transitions the server refuses without a written reason — the three the state
 * machine checks for `blank($notes)`. Every one of them is somebody deciding
 * against the other party, which is why the note is kept.
 */
export const REASON_REQUIRED: DealStatus[] = ['CANCELLED', 'DISPUTED', 'RESOLVED'];

/**
 * Transitions the server refuses until the delivery code has been spent — the two
 * `requires_handover` rules in `DealStateMachineService::TRANSITION_RULES`, which
 * answer `HANDOVER_NOT_VERIFIED`.
 *
 * *Requiring* the scan is the backend's job and it does that job whether or not
 * this file agrees. Hiding the buttons is only the courtesy of not handing
 * someone a control whose whole purpose is to be refused, for a sale is closed
 * once and a person who clicks twice at a gate learns to distrust both.
 */
export const HANDOVER_GATED: DealStatus[] = ['INSPECTION', 'COMPLETED'];

/**
 * Where this organization stands on one order.
 *
 * `null` is a real answer and not a bug to paper over: an organization can see a
 * deal in a report and still not be its buyer or its seller. Such an account gets
 * no buttons, because the state machine would answer "this deal does not belong to
 * your organization", and a screen that offers a refusal has taught the person that
 * the refusal is their fault.
 */
export type DealSide = 'buyer' | 'seller' | 'platform' | null;

/**
 * The moves this account may make on this order: the state's own forward edges,
 * narrowed by who performs them and what the session holds.
 *
 * Both filters are presentation, and neither is enforcement. The party rule is
 * here because a seller's "confirm receipt" button is a refusal waiting to be
 * clicked, and clicking it teaches the wrong story about whose sentence "I have
 * it" is. The server applies its own copy of both, every time, and where it
 * refuses its words are what the screen shows.
 */
export function openMoves(
  deal: Deal,
  side: DealSide,
  can?: (permission: string) => boolean
): DealStatus[] {
  return (NEXT_STATES[deal.status] ?? []).filter((target) => {
    if (side === null) return false;
    if (side !== 'platform' && !(ACTOR_RULES[target] ?? []).includes(side)) return false;
    const permission = STATE_PERMISSIONS[target];
    return !permission || Boolean(can?.(permission));
  });
}

/**
 * …and the same moves once the delivery code is taken into account.
 *
 * `awaitingScan` is the difference between these two lists, which is why it cannot
 * be guessed from the state: an order whose code was spent from another session,
 * or one that arrived before this gate existed, has the same `deal.status` as one
 * still waiting at the gate and must not be told to scan twice.
 */
export function offeredMoves(
  deal: Deal,
  side: DealSide,
  can?: (permission: string) => boolean
): DealStatus[] {
  const open = openMoves(deal, side, can);
  if (deal.handover?.status === 'USED') return open;
  return open.filter((target) => !HANDOVER_GATED.includes(target));
}

/** Whether the unspent code is the only thing holding this order back. */
export function awaitingScan(
  deal: Deal,
  side: DealSide,
  can?: (permission: string) => boolean
): boolean {
  return offeredMoves(deal, side, can).length !== openMoves(deal, side, can).length;
}

/** The one move that carries the deal onward, and the rest of the same edges. */
export function forwardMove(moves: DealStatus[]): DealStatus | undefined {
  return moves.find((state) => state !== 'CANCELLED' && state !== 'DISPUTED');
}

export function otherMoves(moves: DealStatus[], forward?: DealStatus): DealStatus[] {
  return moves.filter((state) => state !== forward);
}

/**
 * Whose turn it is.
 *
 * An order with no moves for this account is not an order with nothing to do:
 * usually the goods are with the other party. Saying which one is the difference
 * between a screen a dispatcher trusts and a screen they telephone somebody about.
 * `null` means the answer is genuinely mixed — both parties can still fall out or
 * call the order off — and then no claim is made.
 */
export function nextParty(deal: Deal): 'buyer' | 'seller' | null {
  const sides = new Set((NEXT_STATES[deal.status] ?? []).flatMap((target) => ACTOR_RULES[target] ?? []));
  if (sides.size === 1 && sides.has('buyer')) return 'buyer';
  if (sides.size === 1 && sides.has('seller')) return 'seller';
  return null;
}

/** An order that has stopped moving: nothing after it is offered but its own record. */
export function isTerminal(status: DealStatus): boolean {
  return status === 'CANCELLED' || status === 'COMPLETED';
}

/** Whether this move is one the server will not take without a written reason. */
export function requiresReason(target: DealStatus): boolean {
  return REASON_REQUIRED.includes(target);
}

/**
 * Whether this session operates the gate for this order.
 *
 * The buyer presents the code; the seller spends it. A platform session keeps the
 * button because a settlement is carried out at the gate by somebody holding no
 * side of the contract, and the printed label does not care whose phone reads it —
 * the server accepts either party.
 */
export function canSpendHandover(
  deal: Deal,
  side: DealSide,
  can?: (permission: string) => boolean
): boolean {
  return (
    deal.handover?.status === 'ACTIVE'
    && HANDOVER_ELIGIBLE.includes(deal.status)
    && (side === 'seller' || side === 'platform')
    && Boolean(can?.('deals.deliver'))
  );
}

/**
 * Which side of this order the session stands on.
 *
 * An account with no organization in context (`null`) is nobody's party, so it
 * reads the record and rules on disputes rather than trading.
 */
export function sideOfDeal(deal: Deal, organizationId: number | null): DealSide {
  if (organizationId === null) return 'platform';
  if (organizationId === Number(deal.buyer_organization_id)) return 'buyer';
  if (organizationId === Number(deal.seller_organization_id)) return 'seller';
  return null;
}
