/**
 * The rules a purchase request lives by, apart from any screen.
 *
 * A request is an *ask*: nothing is held and no money moves until the seller
 * answers it, and the seller's answer can be a counter rather than a yes. Those
 * three facts — who may answer, what a counter must change, what a refusal must
 * say — were written inside a tab component on the pipeline screen, which meant
 * the marketplace's own "ask the seller" flow had no way to agree with it. The
 * server still decides all of this on every call; what lives here only keeps the
 * client from offering a move it knows will be refused, and keeps the two places
 * that ask the same question asking it the same way.
 */
import type { PurchaseRequest } from './types';

/**
 * Which side of this ask the session's organization is on.
 *
 * Both false is the normal case for a platform operator and for an account with no
 * organization in context: it reads the request and rules on it elsewhere, it does
 * not answer for either party.
 */
export function requestParty(
  request: PurchaseRequest,
  organizationId: number | string | null
): { isBuyer: boolean; isSeller: boolean } {
  const id = organizationId === null || organizationId === '' ? null : Number(organizationId);
  return {
    isBuyer: id !== null && Number(request.buyer_organization_id) === id,
    isSeller: id !== null && Number(request.seller_organization_id) === id,
  };
}

/** A counter-offer's fields, as the form holds them: blank means "leave it as asked". */
export type ProposalFields = { quantity?: number; unitPrice?: number };

/** Why a counter-offer cannot be sent, named rather than phrased: the words live in `labels.ts`. */
export type ProposalProblem = 'NOTHING_CHANGED' | 'QUANTITY_TOO_SMALL' | 'PRICE_TOO_SMALL';

/**
 * Why this counter-offer cannot be sent, in a code the screen puts into words.
 *
 * `>= 0.01` and `>= 0.0001` are the server's own floors, and they are written as a
 * negation on purpose: `!(quantity >= 0.01)` refuses a blank, a letter and a
 * negative number alike, where `quantity < 0.01` would let `NaN` through to the
 * endpoint and come back as a validation error the person cannot act on.
 */
export function proposalProblem(fields: ProposalFields): ProposalProblem | null {
  const { quantity, unitPrice } = fields;
  if (quantity === undefined && unitPrice === undefined) return 'NOTHING_CHANGED';
  if (quantity !== undefined && !(quantity >= 0.01)) return 'QUANTITY_TOO_SMALL';
  if (unitPrice !== undefined && !(unitPrice >= 0.0001)) return 'PRICE_TOO_SMALL';
  return null;
}

/** The request body: only the fields the seller actually typed. */
export function proposalPayload({ quantity, unitPrice }: ProposalFields): { quantity?: number; unit_price?: number } {
  return {
    ...(quantity !== undefined ? { quantity } : {}),
    ...(unitPrice !== undefined ? { unit_price: unitPrice } : {}),
  };
}
