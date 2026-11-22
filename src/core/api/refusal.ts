/**
 * What a refusal means, in the operator's language.
 *
 * The transport decodes an envelope; this file says what to tell the person
 * holding the phone. Splitting it from `http.ts` keeps that file about tokens,
 * URLs and pagination, and puts every sentence a screen shows for a failed call
 * in one place a translator can read.
 *
 * Two functions get used together or apart:
 * - `serverMessage` is the line the server itself sent, unchanged — the refusal's
 *   reason or the acknowledgement's confirmation, since both live in the same slot
 *   of the envelope. Use it when the server already explains itself, which it does:
 *   `ApiRefused` carries an Arabic message with every code, and every write route
 *   answers a success with an Arabic sentence too.
 * - `explainRefusal` adds the platform's reading of the code on top, for the
 *   cases where the server sentence is true but not actionable: "this action
 *   requires a permission" is a fact, "your role in your organization does not
 *   hold it" is a next step.
 */

/** The minimum an envelope has to look like — `ApiResult`, or anything shaped like one. */
type RefusalLike = {
  message?: string;
  error_code?: string;
  error?: { code?: string; message?: string } | null;
};

/**
 * The server's own line for a call, or the sentence the caller has ready.
 *
 * Every screen that writes to the API needed this line, and each one wrote it a
 * little differently — `??` against `||`, the nested `error.message` before or
 * after the envelope's `message`, its own Arabic fallback — which is how the same
 * validation failure read as three different problems on three screens. The order
 * here is the one the transport already uses when it normalizes a failure: the
 * nested message is the server's specific sentence, the envelope's is the generic
 * one, and a caller's fallback is only for a response that carried neither.
 *
 * The same read works on a successful envelope, because a successful envelope only
 * carries `message` and `error` is absent: "نُشر العرض بعد الموافقة عليه" comes back
 * through this function just as its refusal does. Screens therefore have one way to
 * put the server's words on screen, and the fallback they pass is what the screen
 * shows when the server said nothing.
 *
 * The parameter is the shape, not `ApiResult`, because some endpoints hand back
 * their own envelope (a label's `{ success, url }`, an export's `{ success, … }`)
 * and the server's line is the same event in all of them.
 */
export function serverMessage(result: RefusalLike | null | undefined, fallback: string): string {
  return result?.error?.message || result?.message || fallback;
}

/** The machine code behind a refusal, or `''` when the response carried none. */
export function refusalCode(result: RefusalLike | null | undefined): string {
  return result?.error?.code ?? result?.error_code ?? '';
}

/**
 * Codes the gateway itself raises, so they can mean one thing everywhere.
 *
 * Anything named by a single module — `INVALID_OFFER_TRANSITION`,
 * `SELF_QUOTATION_DENIED` — belongs to that module's own table, passed in as
 * `codes`. This table only holds what a middleware or the platform layer answers
 * regardless of which route was hit, because those are the refusals a screen
 * would otherwise translate five times over.
 */
const PLATFORM_CODES: Record<string, string> = {
  TENANT_REQUIRED: 'هذه الإجراء يحتاج منشأة عاملة؛ اخترها من أعلى الشاشة.',
  PERMISSION_DENIED: 'رُفض الإجراء: هذا التصرف يتطلب صلاحية لا يملكها حسابك ضمن منشأتك.',
  FEATURE_DISABLED: 'هذه الميزة موقوفة من إعدادات المنصة، فلا ينفَّذ الإجراء الآن.',
  CURRENCY_NOT_ACTIVE: 'لم تُعتمد عملة للمنصة بعد، والرقم يحتاج عملة فعّالة؛ يضبطها مسؤول المنصة أولاً.',
  ACCOUNT_INACTIVE: 'حسابك غير نشط، فلا يُنفَّذ أي إجراء عليه قبل إعادة تفعيله من إدارة المنصة.',
  VALIDATION_FAILED: 'رفض الخادم الحقول المرسلة؛ راجع الرسائل تحت كل حقل.',
};

/** A module's own reading of a code: a fixed sentence, or one built from the server's. */
export type RefusalCodeText = string | ((serverMessage: string) => string);

/**
 * One line for a failed call: the platform's reading of the code, the module's
 * override when it knows better, and the server's sentence when nobody does.
 *
 * The fallback argument stays mandatory. A generic "something went wrong" is the
 * one answer this codebase refuses to show, because a seller who cannot tell an
 * empty shelf from a permission denial stops trusting the screen.
 */
export function explainRefusal(
  result: RefusalLike | null | undefined,
  options: { fallback: string; codes?: Record<string, RefusalCodeText> }
): string {
  const message = serverMessage(result, options.fallback);
  const code = refusalCode(result);
  if (!code) return message;

  const reading = options.codes?.[code] ?? PLATFORM_CODES[code];
  if (typeof reading === 'string') return reading;
  if (typeof reading === 'function') return reading(message);
  return `${code}: ${message}`;
}
