/** Profile and password management, shared by both portals. */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Save, KeyRound, Check } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { Card, CardHeader, CardBody, DataGrid, DataItem } from '../../components/ui/Card.jsx';
import { StatusBadge, Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { FormError } from '../../components/ui/States.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { http } from '../../lib/api.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import { date } from '../../lib/format.js';
import { fieldErrorsOf, cn } from '../../lib/utils.js';

const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'letter', label: 'One letter', test: (v) => /[A-Za-z]/.test(v) },
  { key: 'number', label: 'One number', test: (v) => /\d/.test(v) },
  { key: 'symbol', label: 'One symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export default function ProfilePage() {
  const { user, patchUser } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState({ name: user?.name ?? '', mobile: user?.mobile ?? '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [profileError, setProfileError] = useState('');

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordError, setPasswordError] = useState('');

  const saveProfile = useMutation({
    mutationFn: (payload) => http.patch('/auth/me', payload),
    onSuccess: (result) => {
      patchUser(result.user);
      toast.success('Profile updated');
    },
    onError: (err) => {
      setProfileError(err.message);
      setProfileErrors(fieldErrorsOf(err));
    },
  });

  const changePassword = useMutation({
    mutationFn: (payload) => http.post('/auth/change-password', payload),
    onSuccess: () => {
      setPasswords({ currentPassword: '', newPassword: '' });
      toast.success('Password changed', 'Use your new password next time you sign in.');
    },
    onError: (err) => {
      setPasswordError(err.message);
      setPasswordErrors(fieldErrorsOf(err));
    },
  });

  const submitProfile = (event) => {
    event.preventDefault();
    setProfileError('');

    const next = {};
    if (profile.name.trim().length < 2) next.name = 'Enter your full name.';
    if (!/^[6-9]\d{9}$/.test(profile.mobile)) next.mobile = 'Enter a valid 10-digit mobile number.';
    setProfileErrors(next);
    if (Object.keys(next).length) return;

    // Only send what actually changed.
    const payload = {};
    if (profile.name.trim() !== user.name) payload.name = profile.name.trim();
    if (profile.mobile !== user.mobile) payload.mobile = profile.mobile;

    if (!Object.keys(payload).length) {
      toast.info('Nothing to update');
      return;
    }
    saveProfile.mutate(payload);
  };

  const submitPassword = (event) => {
    event.preventDefault();
    setPasswordError('');

    const next = {};
    if (!passwords.currentPassword) next.currentPassword = 'Enter your current password.';
    const failed = PASSWORD_RULES.filter((rule) => !rule.test(passwords.newPassword));
    if (failed.length) next.newPassword = `Password needs: ${failed.map((r) => r.label.toLowerCase()).join(', ')}.`;
    if (passwords.newPassword && passwords.newPassword === passwords.currentPassword) {
      next.newPassword = 'Choose a password different from your current one.';
    }
    setPasswordErrors(next);
    if (Object.keys(next).length) return;

    changePassword.mutate(passwords);
  };

  return (
    <div data-testid={TESTIDS.profile.root}>
      <PageHeader title="My profile" subtitle="Manage your details and sign-in credentials." />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Personal details" />
            <CardBody>
              <form onSubmit={submitProfile} className="space-y-4" noValidate>
                {profileError ? <FormError message={profileError} /> : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Full name"
                    name="name"
                    value={profile.name}
                    onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                    error={profileErrors.name}
                    testId={TESTIDS.profile.nameInput}
                    required
                  />
                  <Input
                    label="Mobile number"
                    name="mobile"
                    inputMode="numeric"
                    maxLength={10}
                    prefix="+91"
                    value={profile.mobile}
                    onChange={(event) =>
                      setProfile({ ...profile, mobile: event.target.value.replace(/\D/g, '').slice(0, 10) })
                    }
                    error={profileErrors.mobile}
                    hint="Changing this will require re-verification."
                    testId={TESTIDS.profile.mobileInput}
                    required
                  />
                </div>

                <Input
                  label="Email address"
                  name="email"
                  value={user?.email ?? ''}
                  disabled
                  hint="Your email address is used to sign in and cannot be changed here."
                />

                <Button
                  type="submit"
                  icon={Save}
                  loading={saveProfile.isPending}
                  data-testid={TESTIDS.profile.save}
                >
                  Save changes
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Change password" />
            <CardBody>
              <form onSubmit={submitPassword} className="space-y-4" noValidate>
                {passwordError ? <FormError message={passwordError} /> : null}

                <Input
                  label="Current password"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  onChange={(event) =>
                    setPasswords({ ...passwords, currentPassword: event.target.value })
                  }
                  error={passwordErrors.currentPassword}
                  className="sm:max-w-sm"
                  testId={TESTIDS.profile.currentPasswordInput}
                  required
                />

                <div className="sm:max-w-sm">
                  <Input
                    label="New password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    value={passwords.newPassword}
                    onChange={(event) =>
                      setPasswords({ ...passwords, newPassword: event.target.value })
                    }
                    error={passwordErrors.newPassword}
                    testId={TESTIDS.profile.newPasswordInput}
                    required
                  />
                  <ul className="mt-2 grid grid-cols-2 gap-1.5">
                    {PASSWORD_RULES.map((rule) => {
                      const met = rule.test(passwords.newPassword);
                      return (
                        <li
                          key={rule.key}
                          className={cn(
                            'flex items-center gap-1.5 text-[11px]',
                            met ? 'text-success-700' : 'text-slate-400'
                          )}
                        >
                          <Check className={cn('h-3 w-3', met ? 'opacity-100' : 'opacity-40')} />
                          {rule.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <Button
                  type="submit"
                  icon={KeyRound}
                  loading={changePassword.isPending}
                  data-testid={TESTIDS.profile.changePassword}
                >
                  Change password
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Account" />
          <CardBody>
            <DataGrid columns={2}>
              <DataItem label="Role" value={ROLE_LABELS[user?.role] ?? user?.role} />
              <DataItem label="Status" value={<StatusBadge status={user?.status} />} />
              {user?.role === 'customer' ? (
                <>
                  <DataItem label="KYC status" value={<StatusBadge status={user?.kycStatus} />} />
                  <DataItem label="PAN" value={user?.pan || 'Not provided'} mono />
                </>
              ) : null}
              <DataItem label="Member since" value={date(user?.createdAt)} />
              <DataItem
                label="Mobile verified"
                value={user?.mobileVerified ? 'Yes' : 'Not verified'}
              />
            </DataGrid>

            {user?.isDemo ? (
              <div className="mt-5 rounded-lg border border-warning-200 bg-warning-50 p-3">
                <Badge tone="warning">Demo account</Badge>
                <p className="mt-2 text-xs text-warning-800">
                  This account was created by the seed script for demonstration and testing.
                </p>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
