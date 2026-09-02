/** Public landing page with the loan lifecycle overview and entry points. */
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calculator,
  ShieldCheck,
  Zap,
  FileSignature,
  Banknote,
  ClipboardList,
  BadgeCheck,
} from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import Button from '../../components/ui/Button.jsx';

const STEPS = [
  { icon: Calculator, title: 'Check eligibility', body: 'Indicative amount and EMI in seconds.' },
  { icon: ClipboardList, title: 'Apply & complete KYC', body: 'PAN, Aadhaar and documents, all online.' },
  { icon: BadgeCheck, title: 'Get a decision', body: 'Automated credit assessment prices your offer.' },
  { icon: FileSignature, title: 'e-Sign the agreement', body: 'OTP-based consent — no paperwork.' },
  { icon: Banknote, title: 'Receive funds', body: 'Disbursed to your verified bank account.' },
];

export default function LandingPage() {
  return (
    <div data-testid={TESTIDS.landing.root} className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-sm font-bold text-white">
              S
            </span>
            <span>
              <span className="block text-base font-semibold leading-tight text-slate-900">SedBank</span>
              <span className="hidden text-[10px] uppercase tracking-wider text-slate-400 sm:block">
                Digital Lending
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm" data-testid={TESTIDS.landing.login}>
                Sign in
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm" data-testid={TESTIDS.landing.register}>
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand-100 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-300 ring-1 ring-inset ring-brand-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Demonstration platform — all integrations simulated
            </span>

            <h1 className="mt-6 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              The full personal loan lifecycle, in one place.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              SedBank covers application, KYC, credit bureau checks, underwriting, e-agreement,
              disbursement, EMI repayment and closure — for borrowers and for the operations team.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register">
                <Button size="lg" icon={ArrowRight} iconRight fullWidth data-testid={TESTIDS.landing.checkEligibility}>
                  Check your eligibility
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="secondary" fullWidth>
                  Operations portal
                </Button>
              </Link>
            </div>

            <dl className="mt-14 grid grid-cols-2 gap-6 border-t border-slate-200 pt-8 sm:grid-cols-4">
              {[
                ['Loan amount', '₹50K – ₹20L'],
                ['Tenure', '6 – 60 months'],
                ['Interest from', '10.5% p.a.'],
                ['Decision time', 'Under a minute'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              How a SedBank loan works
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Five steps from enquiry to money in the account. Every stage is tracked, and you can
              see exactly where your application stands.
            </p>

            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="card p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-400">
                    <step.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Step {index + 1}
                  </p>
                  <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-3">
            {[
              {
                icon: Zap,
                title: 'Automated underwriting',
                body: 'A configurable rule engine approves, rejects or routes to a credit officer based on bureau score and obligation-to-income ratio.',
              },
              {
                icon: Banknote,
                title: 'Complete servicing',
                body: 'Amortisation schedules, part-payments, foreclosure quotes, overdue ageing, penalties and downloadable statements.',
              },
              {
                icon: ShieldCheck,
                title: 'Nothing real leaves the app',
                body: 'KYC, bureau, penny-drop, e-sign and payment are all mocked locally. No real personal or financial data is processed.',
              },
            ].map((feature) => (
              <div key={feature.title} className="card p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-400">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-slate-500 sm:px-6">
          <p className="font-medium text-slate-700">SedBank — Digital Lending Platform</p>
          <p className="mt-1.5">
            A demonstration application. All KYC, credit bureau, payment and e-sign integrations are
            simulated; no real financial or personal data is processed or transmitted.
          </p>
        </div>
      </footer>
    </div>
  );
}
