/**
 * Product and credit-policy configuration.
 *
 * Nothing here is hardcoded in the app: the amount/tenure/rate bands, fees and
 * every underwriting threshold are read from this document at decision time, so
 * changing a value here changes how the next application is assessed.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Settings, Gauge, Info } from 'lucide-react';
import { TESTIDS } from '@shared/testIds.js';
import { PageHeader } from '../../components/layout/AppShell.jsx';
import { Card, CardHeader, CardBody, CardFooter } from '../../components/ui/Card.jsx';
import { Tabs, TabPanel } from '../../components/ui/Tabs.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Textarea } from '../../components/ui/Field.jsx';
import { LoadingState, ErrorState, FormError } from '../../components/ui/States.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { http } from '../../lib/api.js';
import { currency } from '../../lib/format.js';
import { fieldErrorsOf } from '../../lib/utils.js';

export default function AdminSettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('product');
  const [product, setProduct] = useState(null);
  const [underwriting, setUnderwriting] = useState(null);
  const [blacklistText, setBlacklistText] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['config'],
    queryFn: () => http.get('/config'),
  });

  // Seed local form state once the config arrives.
  useEffect(() => {
    if (!data?.config) return;
    setProduct({ ...data.config.product });
    setUnderwriting({ ...data.config.underwriting });
    setBlacklistText((data.config.underwriting.blacklistedPans || []).join('\n'));
  }, [data]);

  const save = useMutation({
    mutationFn: (payload) => http.put('/config', payload),
    onMutate: () => {
      setFormError('');
      setErrors({});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
      toast.success('Configuration saved', 'New applications are assessed using these values.');
    },
    onError: (err) => {
      setFormError(err.message);
      setErrors(fieldErrorsOf(err));
    },
  });

  if (isLoading || !product || !underwriting) return <LoadingState label="Loading configuration…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const num = (value) => (value === '' ? '' : Number(value));

  const saveProduct = () => {
    const next = {};
    if (!(product.minAmount > 0)) next.minAmount = 'Enter a minimum amount.';
    if (!(product.maxAmount > 0)) next.maxAmount = 'Enter a maximum amount.';
    if (product.minAmount > product.maxAmount) next.minAmount = 'Minimum cannot exceed the maximum.';
    if (product.minTenureMonths > product.maxTenureMonths)
      next.minTenureMonths = 'Minimum tenure cannot exceed the maximum.';
    if (product.minRoi > product.maxRoi) next.minRoi = 'Minimum rate cannot exceed the maximum.';

    setErrors(next);
    if (Object.keys(next).length) return;

    save.mutate({
      product: {
        minAmount: Number(product.minAmount),
        maxAmount: Number(product.maxAmount),
        minTenureMonths: Number(product.minTenureMonths),
        maxTenureMonths: Number(product.maxTenureMonths),
        minRoi: Number(product.minRoi),
        maxRoi: Number(product.maxRoi),
        processingFeePct: Number(product.processingFeePct),
        latePenaltyPct: Number(product.latePenaltyPct),
        foreclosureChargePct: Number(product.foreclosureChargePct),
      },
    });
  };

  const saveUnderwriting = () => {
    const next = {};
    if (underwriting.minScore > underwriting.autoApproveScore)
      next.minScore = 'The rejection floor cannot be above the auto-approval threshold.';
    if (!(underwriting.maxDti > 0) || underwriting.maxDti > 0.9)
      next.maxDti = 'FOIR limit must be between 0.05 and 0.9.';

    const pans = blacklistText
      .split(/[\s,]+/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    const invalid = pans.filter((pan) => !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan));
    if (invalid.length) next.blacklistedPans = `Invalid PAN format: ${invalid.slice(0, 3).join(', ')}`;

    setErrors(next);
    if (Object.keys(next).length) return;

    save.mutate({
      underwriting: {
        minScore: Number(underwriting.minScore),
        autoApproveScore: Number(underwriting.autoApproveScore),
        maxDti: Number(underwriting.maxDti),
        minMonthlyIncome: Number(underwriting.minMonthlyIncome),
        blacklistedPans: pans,
      },
    });
  };

  return (
    <div data-testid={TESTIDS.adminSettings.root}>
      <PageHeader
        title="Product and credit policy"
        subtitle="Loan product limits and the underwriting thresholds the rule engine applies."
      />

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'product', label: 'Loan product', testId: TESTIDS.adminSettings.tabProduct },
          {
            value: 'underwriting',
            label: 'Underwriting rules',
            testId: TESTIDS.adminSettings.tabUnderwriting,
          },
        ]}
      >
        {/* ---------------- Product ---------------- */}
        <TabPanel value="product">
          <Card>
            <CardHeader
              title="Personal loan"
              subtitle="Applies to every new application and to the eligibility calculator."
            />
            <CardBody className="space-y-5">
              {formError ? <FormError message={formError} /> : null}

              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Amount and tenure
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    label="Minimum amount"
                    name="minAmount"
                    type="number"
                    prefix="₹"
                    value={product.minAmount}
                    onChange={(event) => setProduct({ ...product, minAmount: num(event.target.value) })}
                    error={errors.minAmount}
                    testId={TESTIDS.adminSettings.minAmountInput}
                  />
                  <Input
                    label="Maximum amount"
                    name="maxAmount"
                    type="number"
                    prefix="₹"
                    value={product.maxAmount}
                    onChange={(event) => setProduct({ ...product, maxAmount: num(event.target.value) })}
                    error={errors.maxAmount}
                    testId={TESTIDS.adminSettings.maxAmountInput}
                  />
                  <Input
                    label="Minimum tenure (months)"
                    name="minTenureMonths"
                    type="number"
                    value={product.minTenureMonths}
                    onChange={(event) =>
                      setProduct({ ...product, minTenureMonths: num(event.target.value) })
                    }
                    error={errors.minTenureMonths}
                    testId={TESTIDS.adminSettings.minTenureInput}
                  />
                  <Input
                    label="Maximum tenure (months)"
                    name="maxTenureMonths"
                    type="number"
                    value={product.maxTenureMonths}
                    onChange={(event) =>
                      setProduct({ ...product, maxTenureMonths: num(event.target.value) })
                    }
                    error={errors.maxTenureMonths}
                    testId={TESTIDS.adminSettings.maxTenureInput}
                  />
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pricing
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    label="Minimum rate (% p.a.)"
                    name="minRoi"
                    type="number"
                    step="0.1"
                    value={product.minRoi}
                    onChange={(event) => setProduct({ ...product, minRoi: num(event.target.value) })}
                    error={errors.minRoi}
                    testId={TESTIDS.adminSettings.minRoiInput}
                  />
                  <Input
                    label="Maximum rate (% p.a.)"
                    name="maxRoi"
                    type="number"
                    step="0.1"
                    value={product.maxRoi}
                    onChange={(event) => setProduct({ ...product, maxRoi: num(event.target.value) })}
                    error={errors.maxRoi}
                    testId={TESTIDS.adminSettings.maxRoiInput}
                  />
                  <Input
                    label="Processing fee (%)"
                    name="processingFeePct"
                    type="number"
                    step="0.1"
                    value={product.processingFeePct}
                    onChange={(event) =>
                      setProduct({ ...product, processingFeePct: num(event.target.value) })
                    }
                    error={errors.processingFeePct}
                    hint="Deducted from the disbursed amount."
                    testId={TESTIDS.adminSettings.processingFeeInput}
                  />
                  <Input
                    label="Late payment penalty (% of EMI)"
                    name="latePenaltyPct"
                    type="number"
                    step="0.1"
                    value={product.latePenaltyPct}
                    onChange={(event) =>
                      setProduct({ ...product, latePenaltyPct: num(event.target.value) })
                    }
                    error={errors.latePenaltyPct}
                    hint="Charged once per installment when it turns overdue."
                    testId={TESTIDS.adminSettings.latePenaltyInput}
                  />
                  <Input
                    label="Foreclosure charge (% of principal)"
                    name="foreclosureChargePct"
                    type="number"
                    step="0.1"
                    value={product.foreclosureChargePct}
                    onChange={(event) =>
                      setProduct({ ...product, foreclosureChargePct: num(event.target.value) })
                    }
                    error={errors.foreclosureChargePct}
                    testId={TESTIDS.adminSettings.foreclosureChargeInput}
                  />
                </div>
              </section>

              <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                Customers can currently borrow {currency(product.minAmount)} –{' '}
                {currency(product.maxAmount)} over {product.minTenureMonths}–
                {product.maxTenureMonths} months at {product.minRoi}%–{product.maxRoi}% p.a.
              </p>
            </CardBody>

            <CardFooter>
              <Button
                icon={Save}
                loading={save.isPending}
                onClick={saveProduct}
                data-testid={TESTIDS.adminSettings.saveProduct}
              >
                Save product settings
              </Button>
            </CardFooter>
          </Card>
        </TabPanel>

        {/* ---------------- Underwriting ---------------- */}
        <TabPanel value="underwriting">
          <Card>
            <CardHeader
              title="Automated underwriting rules"
              subtitle="Applied by the rule engine the moment a bureau report is pulled."
            />
            <CardBody className="space-y-5">
              {formError ? <FormError message={formError} /> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Rejection floor (bureau score)"
                  name="minScore"
                  type="number"
                  min="300"
                  max="900"
                  value={underwriting.minScore}
                  onChange={(event) =>
                    setUnderwriting({ ...underwriting, minScore: num(event.target.value) })
                  }
                  error={errors.minScore}
                  hint="Applications below this score are declined automatically."
                  testId={TESTIDS.adminSettings.minScoreInput}
                />
                <Input
                  label="Auto-approval threshold (bureau score)"
                  name="autoApproveScore"
                  type="number"
                  min="300"
                  max="900"
                  value={underwriting.autoApproveScore}
                  onChange={(event) =>
                    setUnderwriting({ ...underwriting, autoApproveScore: num(event.target.value) })
                  }
                  error={errors.autoApproveScore}
                  hint="At or above this score, and within the FOIR limit, applications approve straight through."
                  testId={TESTIDS.adminSettings.autoApproveScoreInput}
                />
                <Input
                  label="Maximum FOIR / DTI"
                  name="maxDti"
                  type="number"
                  step="0.01"
                  min="0.05"
                  max="0.9"
                  value={underwriting.maxDti}
                  onChange={(event) =>
                    setUnderwriting({ ...underwriting, maxDti: num(event.target.value) })
                  }
                  error={errors.maxDti}
                  hint={`Share of income that may go to EMIs. ${(underwriting.maxDti * 100).toFixed(0)}% today.`}
                  testId={TESTIDS.adminSettings.maxDtiInput}
                />
                <Input
                  label="Minimum monthly income"
                  name="minMonthlyIncome"
                  type="number"
                  prefix="₹"
                  value={underwriting.minMonthlyIncome}
                  onChange={(event) =>
                    setUnderwriting({ ...underwriting, minMonthlyIncome: num(event.target.value) })
                  }
                  error={errors.minMonthlyIncome}
                  testId={TESTIDS.adminSettings.minIncomeInput}
                />
              </div>

              <div className="rounded-card border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-2.5">
                  <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="text-xs leading-relaxed text-slate-600">
                    <p className="font-semibold text-slate-700">How the rules combine</p>
                    <p className="mt-1">
                      Score below <strong>{underwriting.minScore}</strong> → declined. Score at or
                      above <strong>{underwriting.autoApproveScore}</strong> with FOIR within{' '}
                      <strong>{(underwriting.maxDti * 100).toFixed(0)}%</strong> → approved
                      automatically. Anything in between goes to a credit officer. The sanctioned
                      amount is always capped so FOIR stays within the limit.
                    </p>
                  </div>
                </div>
              </div>

              <Textarea
                label="Negative list (PANs)"
                name="blacklistedPans"
                rows={4}
                placeholder="ABCDE1234F&#10;PQRST5678K"
                value={blacklistText}
                onChange={(event) => setBlacklistText(event.target.value)}
                error={errors.blacklistedPans}
                hint="One PAN per line. Applications matching these are always declined."
                testId={TESTIDS.adminSettings.blacklistInput}
              />

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Risk-based pricing grid
                </h3>
                <div className="table-scroll">
                  <table className="data-table min-w-[320px]">
                    <thead>
                      <tr>
                        <th>Band</th>
                        <th className="text-right">Minimum score</th>
                        <th className="text-right">Rate offered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(underwriting.riskPricing ?? []).map((row) => (
                        <tr key={row.minScore}>
                          <td>{row.label}</td>
                          <td className="text-right">{row.minScore}+</td>
                          <td className="text-right font-medium text-slate-900">{row.roi}% p.a.</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint">
                  Approved offers are priced from this grid, clamped to the product's rate band.
                </p>
              </div>
            </CardBody>

            <CardFooter>
              <Button
                icon={Save}
                loading={save.isPending}
                onClick={saveUnderwriting}
                data-testid={TESTIDS.adminSettings.saveUnderwriting}
              >
                Save underwriting rules
              </Button>
            </CardFooter>
          </Card>
        </TabPanel>
      </Tabs>
    </div>
  );
}
