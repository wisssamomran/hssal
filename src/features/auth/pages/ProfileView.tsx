import React, { useEffect, useState } from 'react';
import { KeyRound, UserRound } from 'lucide-react';
import { fieldError } from '@/core/api/http';
import { changePassword, updateProfile } from '@/features/auth/api';
import type { User } from '@/features/identity/types';
import type { Locale } from '@/core/i18n';
import { BannerView, DecisionButton, ErrorNote, PanelShell, TextInput } from '@/shared/ui/panel';
import type { Banner } from '@/shared/ui/panel';
import { SigninDevicesPanel } from '@/features/auth/components/SigninDevicesPanel';
import SupportDeskView from '@/features/support/components/SupportDeskPanel';

/**
 * The account's own human details, and its password.
 *
 * Deliberately narrow. This screen edits one row — the signed-in person — and
 * nothing else: the business record lives on `OrganizationProfileView` behind
 * `organizations.manage`, and roles are granted by platform staff behind
 * `users.manage`. A profile form that could rename a company or hand itself a
 * permission would be the shortest privilege escalation in the product.
 *
 * The email address is displayed and never editable, because a mailbox is what
 * the password-reset flow proves control of. Moving it by typing into a form
 * would pass the next owner all of the previous owner's resets.
 */

export const ProfileView: React.FC<{
  currentUser: User | null;
  locale: Locale;
  /** The server may have changed the account (a revoked token, a new name). */
  onSessionChanged: () => void;
  /**
   * Revoking this browser's own row leaves a dead token in the tab, so the
   * caller clears the session — the same thing the header's sign-out does.
   */
  onSignOut: () => void;
  onNotify?: (message: string) => void;
}> = ({ currentUser, locale, onSessionChanged, onSignOut, onNotify }) => {
  const ar = locale === 'ar';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [profileBanner, setProfileBanner] = useState<Banner>(null);
  const [profileErrors, setProfileErrors] = useState<{ phone?: string }>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBanner, setPasswordBanner] = useState<Banner>(null);
  const [changing, setChanging] = useState(false);

  // The row can change underneath this screen (a platform admin edits the
  // account), so the fields follow the session rather than the first render.
  useEffect(() => {
    setName(currentUser?.name ?? '');
    setPhone(currentUser?.phone ?? '');
    setNationalId(currentUser?.national_id ?? '');
  }, [currentUser?.id, currentUser?.name, currentUser?.phone, currentUser?.national_id]);

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileBanner(null);
    setProfileErrors({});

    // Only what actually changed, so an untouched nullable field is not sent as
    // an explicit null and wiped.
    const patch: Record<string, string> = {};
    if (name !== (currentUser?.name ?? '')) patch.name = name;
    if (phone !== (currentUser?.phone ?? '')) patch.phone = phone;
    if (nationalId !== (currentUser?.national_id ?? '')) patch.national_id = nationalId;

    if (Object.keys(patch).length === 0) {
      setProfileBanner({ kind: 'error', text: ar ? 'لم يُغيَّر شيء لحفظه.' : 'Nothing changed to save.' });
      setSavingProfile(false);
      return;
    }

    const response = await updateProfile(patch);
    setSavingProfile(false);

    if (!response.success) {
      // A phone another account verifies with is refused by the validation
      // rule, and the answer belongs under the field, not in a banner.
      const phoneMessage = fieldError(response, 'phone');
      if (phoneMessage) setProfileErrors({ phone: phoneMessage });
      setProfileBanner({ kind: 'error', text: response.message ?? 'تعذّر حفظ الملف الشخصي' });
      return;
    }

    setProfileBanner({ kind: 'ok', text: response.message ?? (ar ? 'تم الحفظ' : 'Saved') });
    onSessionChanged();
    if (onNotify) onNotify(ar ? 'تم تحديث ملفك الشخصي' : 'Profile updated');
  };

  const submitPasswordChange = async () => {
    if (newPassword.length < 8) {
      setPasswordBanner({ kind: 'error', text: ar ? 'كلمة المرور الجديدة 8 أحرف على الأقل.' : 'Use at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordBanner({ kind: 'error', text: ar ? 'التأكيد لا يطابق كلمة المرور الجديدة.' : 'The confirmation does not match.' });
      return;
    }

    setChanging(true);
    setPasswordBanner(null);

    const response = await changePassword({
      current_password: currentPassword,
      password: newPassword,
      password_confirmation: confirmPassword,
    });

    setChanging(false);

    if (!response.success) {
      setPasswordBanner({
        kind: 'error',
        text: fieldError(response, 'password') ?? response.message ?? 'تعذّر تغيير كلمة المرور',
      });
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    // The server revoked every other token on the account. Saying so is the
    // only way this is a warning rather than a surprise on a second device.
    setPasswordBanner({
      kind: 'ok',
      text: ar
        ? 'تم تغيير كلمة المرور، وتم تسجيل الخروج من الأجهزة الأخرى.'
        : 'Password changed. Other devices were signed out.',
    });
  };

  if (!currentUser) {
    return (
      <ErrorNote
        text={ar
          ? 'سجّل الدخول أولًا: هذه الشاشة تعدّل بيانات حسابك أنت.'
          : 'Sign in first: this screen edits your own account.'}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PanelShell
          title={ar ? 'بيانات الحساب' : 'Account details'}
          hint={ar
            ? 'اسمك وهاتفك ورقمك الوطني. منشأتك تُعدَّل من شاشة "ملف المنشأة والسجل"، والبريد الإلكتروني غير قابل للتعديل هنا لأنه ما تُثبت به استعادة كلمة المرور ملكية الحساب.'
            : 'Your name, phone and national id. Your business is edited on the organization screen. Email is not editable here, because the reset flow proves control of a mailbox.'}
        >
          <BannerView banner={profileBanner} />

          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
            <UserRound className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 max-w-full truncate font-bold text-slate-700" dir="ltr" title={currentUser.email}>
              {currentUser.email}
            </span>
            <span className="shrink-0">•</span>
            <span className="shrink-0">{ar ? 'غير قابل للتعديل' : 'not editable'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextInput label={ar ? 'الاسم' : 'Name'} value={name} onChange={setName} wide />
            <TextInput
              label={ar ? 'الهاتف' : 'Phone'}
              value={phone}
              onChange={setPhone}
              wide
              error={profileErrors.phone}
            />
            <TextInput
              label={ar ? 'الرقم الوطني / الهوية' : 'National id'}
              value={nationalId}
              onChange={setNationalId}
              wide
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <DecisionButton tone="primary" busy={savingProfile} onClick={() => { void saveProfile(); }}>
              {savingProfile ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ التغييرات' : 'Save changes')}
            </DecisionButton>
            <span className="text-[10px] leading-relaxed text-slate-400">
              {ar
                ? 'يُرسل الحفظ الحقول التي غيَّرتها فقط، والاسم مطلوب ولا يُحفظ فارغًا.'
                : 'Only the fields you changed are sent, and the name cannot be saved empty.'}
            </span>
          </div>
        </PanelShell>

        <PanelShell
          title={ar ? 'كلمة المرور' : 'Password'}
          hint={ar
            ? 'تغيير كلمة المرور يُبقي هذا الجهاز داخل الجلسة ويسجّل الخروج من بقية الأجهزة. لا تحتفظ المنصة بالكلمة كنص مقروء: تُخزَّن بصيغة تجزئة غير قابلة للعكس.'
            : 'Changing it keeps this device signed in and revokes every other token. The platform stores an irreversible hash, never readable text.'}
        >
          <BannerView banner={passwordBanner} />

          <div className="space-y-3">
            <TextInput
              label={ar ? 'كلمة المرور الحالية' : 'Current password'}
              value={currentPassword}
              onChange={setCurrentPassword}
              type="password"
              wide
            />
            <TextInput
              label={ar ? 'كلمة المرور الجديدة' : 'New password'}
              value={newPassword}
              onChange={setNewPassword}
              type="password"
              wide
            />
            <TextInput
              label={ar ? 'تأكيد كلمة المرور الجديدة' : 'Confirm new password'}
              value={confirmPassword}
              onChange={setConfirmPassword}
              type="password"
              wide
            />
          </div>

          <div className="space-y-2">
            <div className="flex min-w-0 items-start gap-2 text-[10px] leading-relaxed text-slate-500">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{ar ? '8 أحرف على الأقل' : 'Minimum 8 characters'}</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <DecisionButton busy={changing} onClick={() => { void submitPasswordChange(); }}>
                {changing ? (ar ? 'جارٍ التغيير…' : 'Changing…') : (ar ? 'تغيير كلمة المرور' : 'Change password')}
              </DecisionButton>
              <span className="text-[10px] leading-relaxed text-slate-400">
                {ar
                  ? 'لا يُرسل التغيير طلبًا إلا بعد تطابق حقلي كلمة المرور الجديدة.'
                  : 'The request is sent only once the two new-password fields match.'}
              </span>
            </div>
          </div>
        </PanelShell>
      </div>

      {/* Under the two forms rather than beside them: this list is read before
          it is acted on, and a row that is a phone in another room deserves the
          full width of the screen it is being judged on. */}
      <SigninDevicesPanel locale={locale} onSelfRevoked={onSignOut} onNotify={onNotify} />

      {/* The desk itself. It belongs on the account's own screen rather than a
          nav tab: a report is about this person's session — the device that
          cannot get in, the password that will not change — and filing one costs
          no permission, so the verified-tenant gates that hide the other tabs
          must not hide this one. */}
      <SupportDeskView locale={locale} screen="profile" screenLabel={ar ? 'حسابي' : 'My account'} onNotify={onNotify} />
    </div>
  );
};
