/** Split marketing/form layout shared by the sign-in and sign-up screens. */
import { Link } from 'react-router-dom';
import { ShieldCheck, Zap, FileCheck2 } from 'lucide-react';

const HIGHLIGHTS = [
  {
    icon: Zap,
    title: 'Decisions in minutes',
    body: 'Automated underwriting prices your offer as soon as the credit check completes.',
  },
  {
    icon: FileCheck2,
    title: 'Fully digital journey',
    body: 'KYC, documents, e-signature and disbursement — all handled in the browser.',
  },
  {
    icon: ShieldCheck,
    title: 'Nothing leaves the app',
    body: 'Every integration is simulated. No real financial or personal data is processed.',
  },
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel — hidden on small screens so the form is above the fold. */}
      <div className="relative hidden overflow-hidden border-r border-white/10 bg-canvas-deep/50 backdrop-blur-heavy lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div
          className="orb orb-wine -right-24 -top-24 h-[34rem] w-[34rem] animate-drift"
          aria-hidden="true"
        />
        <div
          className="orb orb-gold -bottom-32 -left-16 h-[30rem] w-[30rem] animate-drift-slow"
          aria-hidden="true"
        />

        <div className="relative">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-base font-bold text-white shadow-glow-brand">
              S
            </span>
            <span>
              <span className="block text-lg font-semibold text-white">SedBank</span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-slate-400">
                Digital Lending
              </span>
            </span>
          </Link>

          <h2 className="mt-14 max-w-md text-3xl font-semibold leading-tight text-white">
            Personal loans, from application to closure.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            One platform covering eligibility, KYC, credit checks, underwriting, disbursement, EMI
            repayment and loan closure.
          </p>

          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/10">
                  <item.icon className="h-4 w-4 text-brand-300" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{item.title}</span>
                  <span className="mt-0.5 block max-w-sm text-xs leading-relaxed text-slate-400">
                    {item.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-slate-500">
          Demonstration environment — simulated data only.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-sm font-bold text-white shadow-glow-brand">
              S
            </span>
            <span className="text-base font-semibold text-slate-900">SedBank</span>
          </Link>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p> : null}

          <div className="mt-7">{children}</div>

          {footer ? <div className="mt-6 text-center text-sm text-slate-600">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
