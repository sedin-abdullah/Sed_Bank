/** Customer self-registration. Staff accounts are created by an admin instead. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Check } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import AuthLayout from './AuthLayout.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { FormError } from '../../components/ui/States.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { fieldErrorsOf, cn } from '../../lib/utils.js';

/** Mirrors the server's policy so the requirements are visible while typing. */
const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'letter', label: 'One letter', test: (v) => /[A-Za-z]/.test(v) },
  { key: 'number', label: 'One number', test: (v) => /\d/.test(v) },
  { key: 'symbol', label: 'One symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => {
    const value =
      field === 'mobile' ? event.target.value.replace(/\D/g, '').slice(0, 10) : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const validate = () => {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email address.';
    if (!/^[6-9]\d{9}$/.test(form.mobile)) next.mobile = 'Enter a valid 10-digit mobile number.';

    const failed = PASSWORD_RULES.filter((rule) => !rule.test(form.password));
    if (failed.length) next.password = `Password needs: ${failed.map((r) => r.label.toLowerCase()).join(', ')}.`;

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!validate()) return;

    setBusy(true);
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        mobile: form.mobile,
        password: form.password,
      });
      toast.success('Account created', `Welcome to SedBank, ${user.name.split(' ')[0]}.`);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
      setErrors(fieldErrorsOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Check your eligibility and apply for a personal loan in minutes."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" data-testid={TESTIDS.register.toLogin} className="link">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate data-testid={TESTIDS.register.root}>
        {error ? (
          <div data-testid={TESTIDS.register.error}>
            <FormError message={error} />
          </div>
        ) : null}

        <Input
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="Ravi Kumar"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          testId={TESTIDS.register.nameInput}
          required
        />

        <Input
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          testId={TESTIDS.register.emailInput}
          required
        />

        <Input
          label="Mobile number"
          name="mobile"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="9876543210"
          maxLength={10}
          prefix="+91"
          value={form.mobile}
          onChange={set('mobile')}
          error={errors.mobile}
          testId={TESTIDS.register.mobileInput}
          required
        />

        <div>
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a strong password"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            testId={TESTIDS.register.passwordInput}
            required
          />

          {/* Live requirement checklist — clearer than an error after submit. */}
          <ul className="mt-2 grid grid-cols-2 gap-1.5">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(form.password);
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
          variant="cta"
          fullWidth
          size="lg"
          icon={UserPlus}
          loading={busy}
          data-testid={TESTIDS.register.submit}
        >
          Create account
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-slate-400">
          This is a demonstration platform. Do not enter real PAN, Aadhaar or bank details — all
          verification is simulated.
        </p>
      </form>
    </AuthLayout>
  );
}
