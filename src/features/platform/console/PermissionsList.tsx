import React from 'react';

/**
 * What a role is worth, opened on the row that is about to grant it.
 *
 * This used to be a `title` attribute, which no phone can open: the operator saw
 * "12 صلاحيات" and had to guess whether they were about to hand over `users.manage`. A
 * native `<details>` needs no state, no endpoint and no hover — and it is the same
 * control on both halves of the accounts desk, the platform grade and the standing
 * inside one company, which is why it is a component rather than two copies of the
 * markup.
 *
 * The names are printed as the server spells them, in a monospace face: an operator
 * comparing what a role grants against what a route requires is matching strings, and
 * prettifying `offers.moderate` into "moderate offers" breaks that.
 */
export const PermissionsList: React.FC<{ label: string; permissions: string[] }> = ({ label, permissions }) => (
  <details className="min-w-0 text-[10px] text-slate-500">
    <summary className="cursor-pointer font-bold text-slate-600">{label}</summary>
    <ul className="mt-1 list-disc space-y-0.5 border-s border-slate-200 ps-4">
      {permissions.map((permission) => (
        <li key={permission} className="break-all font-mono">
          {permission}
        </li>
      ))}
    </ul>
  </details>
);
