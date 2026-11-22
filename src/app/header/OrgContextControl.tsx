import React from 'react';
import { contextFieldClass } from './styles';
import type { Locale } from '@/core/i18n';
import type { ActiveOrganization, OrganizationSummary } from '@/features/organizations/types';
import { organizationContextNotice, organizationName, organizationTypeLabel } from '@/features/organizations/review';

/**
 * Which business this session answers for — or the honest reason that it answers
 * for none.
 *
 * Three shapes and one rule about each:
 * - Several memberships become a `<select>`, because the server answers for whichever
 *   business a request names, so the choice has to be on screen and not only in storage.
 * - One active business is a label, not a control: there is nothing to choose, and a box
 *   that looks like a dropdown with one option in it trains people to click things that
 *   do nothing.
 * - No business at all says which of the three situations this is (not signed in, no
 *   business registered yet, or a file that exists and was never chosen) and opens the
 *   one door that fits — the wording comes from `organizationContextNotice`.
 *
 * Defined once and drawn twice: the desktop strip and the phone sheet, in whichever
 * width that surface has.
 */
export const OrgContextControl: React.FC<{
  currentOrg: ActiveOrganization | null;
  organizations: OrganizationSummary[];
  signedIn: boolean;
  locale: Locale;
  fullWidth: boolean;
  onSelect: (organizationId: number) => void;
  onOpenOrganizationFile: () => void;
  onLogin: () => void;
}> = ({ currentOrg, organizations, signedIn, locale, fullWidth, onSelect, onOpenOrganizationFile, onLogin }) => {
  const field = contextFieldClass(fullWidth);

  if (organizations.length > 1) {
    return (
      <select
        id="organization-switcher"
        value={currentOrg?.id ?? ''}
        onChange={(event) => onSelect(Number(event.target.value))}
        className={`${field} cursor-pointer`}
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {`${organizationName(organization, locale, '—')} — ${organizationTypeLabel(organization.type, locale)}`}
          </option>
        ))}
      </select>
    );
  }

  if (currentOrg) return <span className={field}>{organizationName(currentOrg, locale)}</span>;

  const notice = organizationContextNotice({ signedIn, memberships: organizations.length }, locale);

  return (
    <button
      type="button"
      onClick={() => (notice.action === 'login' ? onLogin() : onOpenOrganizationFile())}
      title={locale === 'en' ? 'The business a session trades as' : 'المنشأة التي يتحدث باسمها هذا المسار'}
      className={`${field} text-start transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:hover:bg-hassal-raised`}
    >
      {notice.text}
    </button>
  );
};
