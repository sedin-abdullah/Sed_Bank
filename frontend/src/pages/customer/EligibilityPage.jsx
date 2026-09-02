/**
 * Pre-qualification calculator.
 * Public endpoint, no persistence — gives an indicative amount, EMI and rate
 * before the customer commits to an application.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Calculator, ArrowRight, Info, XCircle } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { Card, CardHeader, CardBody, DataGrid, DataItem } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import { FormError } from '../../components/ui/States.jsx';
import { http } from '../../lib/api.js';
import { currency, ratioPercent } from '../../lib/format.js';
import { EMPLOYMENT_TYPES } from '../../lib/constants.js';
import { fieldErrorsOf } from '../../lib/utils.js';

export default function EligibilityPage() {
  const navigate = useNavigate();

  const { data: productData } = useQuery({
    queryKey: ['product'],
    queryFn: () => http.get('/product'),
    staleTime: 5 * 60_000,
  });

  const product = productData?.product;

  const [form, setForm] = useState({
    monthlyIncome: '',
    employmentType: 'salaried',
    existingEmi: '0',
    desiredAmount: '',
    tenureMonths: '36',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const check = useMutation({
    mutationFn: (payload) => http.post('/eligibility/check', payload),
    onError: (err) => {
      setError(err.message);
      setErrors(fieldErrorsOf(err));
    },
  });

  const validate = () => {
    const next = {};
    const income = Number(form.monthlyIncome);
    if (!(income > 0)) next.monthlyIncome = 'Enter your monthly income.';

    const emi = Number(form.existingEmi || 0);
    if (emi < 0) next.existingEmi = 'Existing EMI cannot be negative.';
    if (income > 0 && emi >= income) next.existingEmi = 'Existing EMI cannot exceed your income.';

    const tenure = Number(form.tenureMonths);
    if (product && (tenure < product.minTenureMonths || tenure > product.maxTenureMonths)) {
      next.tenureMonths = `Tenure must be between ${product.minTenureMonths} and ${product.maxTenureMonths} months.`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (event) => {
    event.preventDefault();
    setError('');
    if (!validate()) return;

    check.mutate({
      monthlyIncome: Number(form.monthlyIncome),
      employmentType: form.employmentType,
      existingEmi: Number(form.existingEmi || 0),
      ...(form.desiredAmount ? { desiredAmount: Number(form.desiredAmount) } : {}),
      tenureMonths: Number(form.tenureMonths),
    });
  };

  const result = check.data;

  return (
    <div data-testid={TESTIDS.eligibility.root}>
      <PageHeader
        title="Eligibility calculator"
        subtitle="See what you could borrow before you apply. This is indicative and does not affect your credit score."
      />

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Your details" />
          <CardBody>
            <form onSubmit={submit} className="space-y-4" noValidate>
              {error ? <FormError message={error} /> : null}

              <Input
                label="Monthly income (take-home)"
                name="monthlyIncome"
                type="number"
                inputMode="numeric"
                min="0"
                prefix="₹"
                placeholder="75000"
                value={form.monthlyIncome}
                onChange={set('monthlyIncome')}
                error={errors.monthlyIncome}
                testId={TESTIDS.eligibility.incomeInput}
                required
              />

              <Select
                label="Employment type"
                name="employmentType"
                value={form.employmentType}
                onChange={set('employmentType')}
                options={EMPLOYMENT_TYPES}
                error={errors.employmentType}
                testId={TESTIDS.eligibility.employmentSelect}
              />

              <Input
                label="Existing monthly EMI obligations"
                name="existingEmi"
                type="number"
                inputMode="numeric"
                min="0"
                prefix="₹"
                placeholder="0"
                value={form.existingEmi}
                onChange={set('existingEmi')}
                error={errors.existingEmi}
                hint="Total EMIs you already pay on other loans."
                testId={TESTIDS.eligibility.existingEmiInput}
              />

              <Input
                label="Amount you need (optional)"
                name="desiredAmount"
                type="number"
                inputMode="numeric"
                min="0"
                prefix="₹"
                placeholder={product ? String(product.minAmount) : '200000'}
                value={form.desiredAmount}
                onChange={set('desiredAmount')}
                error={errors.desiredAmount}
                hint={
                  product
                    ? `Between ${currency(product.minAmount)} and ${currency(product.maxAmount)}.`
                    : undefined
                }
                testId={TESTIDS.eligibility.amountInput}
              />

              <Input
                label="Preferred tenure (months)"
                name="tenureMonths"
                type="number"
                inputMode="numeric"
                min={product?.minTenureMonths ?? 6}
                max={product?.maxTenureMonths ?? 60}
                value={form.tenureMonths}
                onChange={set('tenureMonths')}
                error={errors.tenureMonths}
                testId={TESTIDS.eligibility.tenureInput}
              />

              <Button
                type="submit"
                fullWidth
                size="lg"
                icon={Calculator}
                loading={check.isPending}
                data-testid={TESTIDS.eligibility.submit}
              >
                Check eligibility
              </Button>
            </form>
          </CardBody>
        </Card>

        <div className="lg:col-span-3">
          {!result ? (
            <Card className="h-full">
              <CardBody className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                  <Calculator className="h-6 w-6 text-brand-400" />
                </span>
                <h3 className="text-sm font-semibold text-slate-900">Your indicative offer</h3>
                <p className="mt-1.5 max-w-sm text-sm text-slate-500">
                  Fill in your income and obligations, and we will show the amount, EMI and rate you
                  could qualify for.
                </p>
              </CardBody>
            </Card>
          ) : result.eligible ? (
            <Card testId={TESTIDS.eligibility.result}>
              <CardHeader
                title="You are likely to qualify"
                subtitle="Indicative only — the final offer follows a credit bureau check."
              />
              <CardBody>
                <div className="rounded-card border border-white/10 bg-brand-gradient p-5 text-white shadow-glow-brand">
                  <p className="text-xs font-medium uppercase tracking-wide text-white/70">
                    Eligible amount
                  </p>
                  <p
                    data-testid={TESTIDS.eligibility.resultAmount}
                    className="mt-1 text-3xl font-semibold tracking-tight"
                  >
                    {currency(result.eligibleAmount)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-6">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-white/70">Monthly EMI</p>
                      <p data-testid={TESTIDS.eligibility.resultEmi} className="mt-0.5 text-lg font-semibold">
                        {currency(result.emi, { decimals: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-white/70">Interest rate</p>
                      <p data-testid={TESTIDS.eligibility.resultRoi} className="mt-0.5 text-lg font-semibold">
                        {result.indicativeRoi}% p.a.
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-white/70">Tenure</p>
                      <p className="mt-0.5 text-lg font-semibold">{result.tenureMonths} months</p>
                    </div>
                  </div>
                </div>

                <DataGrid className="mt-5" columns={3}>
                  <DataItem label="Maximum eligible" value={currency(result.maxEligibleAmount)} />
                  <DataItem
                    label={`Processing fee (${result.processingFeePct}%)`}
                    value={currency(result.processingFee, { decimals: 2 })}
                  />
                  <DataItem label="Total interest" value={currency(result.totalInterest, { decimals: 2 })} />
                  <DataItem label="Total payable" value={currency(result.totalPayable, { decimals: 2 })} />
                  <DataItem
                    label="Obligation to income"
                    value={`${ratioPercent(result.foir)} of ${ratioPercent(result.maxFoir, 0)} limit`}
                  />
                  <DataItem label="Product" value={result.product?.name} />
                </DataGrid>

                <p className="mt-5 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {result.disclaimer}
                </p>

                <Button
                  className="mt-5"
                  size="lg"
                  icon={ArrowRight}
                  iconRight
                  onClick={() =>
                    navigate('/app/apply', {
                      state: {
                        amount: result.eligibleAmount,
                        tenure: result.tenureMonths,
                        monthlyIncome: Number(form.monthlyIncome),
                        existingEmi: Number(form.existingEmi || 0),
                        employmentType: form.employmentType,
                      },
                    })
                  }
                  data-testid={TESTIDS.eligibility.applyNow}
                >
                  Apply for this amount
                </Button>
              </CardBody>
            </Card>
          ) : (
            <Card testId={TESTIDS.eligibility.ineligible}>
              <CardBody className="flex flex-col items-center py-10 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning-50">
                  <XCircle className="h-6 w-6 text-warning-600" />
                </span>
                <h3 className="text-sm font-semibold text-slate-900">
                  You do not qualify on these figures
                </h3>
                <ul className="mt-3 max-w-md space-y-1.5 text-sm text-slate-600">
                  {result.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <p className="mt-4 max-w-md text-xs text-slate-500">
                  Try a longer tenure or a smaller amount, or reduce your existing obligations before
                  applying.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
