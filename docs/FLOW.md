# End-to-end flow

The personal-loan lifecycle in the order it happens, with the role that acts at
each step. Every threshold below is the app's own configured default, editable
under **Admin → Product & rules**.

Roles switch several times. Sign out and back in, or use two browser profiles
side by side — the officer's worklist updates live, which is worth seeing.

## Before you start

**Admin → Partner banks → add a bank with type `disbursement`.** Funds are
released from that account, so without one the Disburse button never enables.
This is the most common thing to forget.

## Origination

| # | Stage | Who | What happens |
|---|---|---|---|
| 1 | Eligibility | Customer | Optional pre-qualification. Nothing is recorded against a credit file. |
| 2 | Application | Customer | Loan details, employment, personal details. |
| 3 | KYC | Customer | PAN + Aadhaar against the mocked provider. |
| 4 | Documents | Customer | Income and address proof uploaded. |
| 5 | Credit check | Customer | Bureau pull + rule engine. **The branch point.** |
| 5a | Manual review | Credit officer | Only if the engine routed it there. |
| 6 | Offer | Customer | Accept the sanctioned amount, rate and EMI. |
| 7 | e-Sign | Customer | OTP-signed agreement, then a payout account. |
| 8 | Disbursement | Ops officer | Verify documents, release funds, generate the schedule. |

### A concrete run

1. **Admin** — add the disbursement bank (above), then sign out.
2. **Create an account** — name `Ravi Kumar`, mobile `9876543210`, password `Passw0rd!23`.
3. **Apply for a loan** — amount `400000`, tenure `36`, purpose `Home renovation`.
4. **Employment** — salaried, income `90000`, existing EMI `5000`.
   Income matters: this keeps FOIR near 21%, well inside the 50% limit. A low
   income against a large amount is refused by the engine and needs an officer
   override.
5. **Personal** — city `Chennai`, state `Tamil Nadu`, pincode `600001`. Submit.
6. **KYC** — PAN `ABCDE1234F`, Aadhaar `123412341234`.
7. **Documents** — upload an income proof and an address proof (any PDF, ≤5 MB).
8. **Run credit check.** Then follow whichever branch you land on:
   - score ≥ 750 → approved straight through, continue at 9
   - score 600–749 → sign in as **credit officer**, open the application,
     **Approve** with remarks, then return as the customer
   - score < 600 → declined; register another customer and retry
9. **Accept offer**, then **e-Sign**: tick consent, request the OTP — it appears
   in a labelled demo hint on the page, because no SMS vendor is wired up —
   enter it and sign.
10. **Payout account** — holder `Ravi Kumar`, account `111122223333`,
    IFSC `ICIC0001111`. Status becomes *awaiting disbursement*.
11. **Ops officer** — open the application, **verify every document**, then
    **Disburse → Confirm**. A loan account is created with one schedule row per
    month. ₹4,00,000 sanctioned releases **₹3,92,000** after the 2% fee.

## How the engine decides

Evaluated in order at stage 5; the first rule that fires wins.

| Condition | Threshold | Outcome |
|---|---|---|
| Bureau score below the floor | < 600 | Auto-declined |
| Declared monthly income below the minimum | < ₹15,000 | Auto-declined |
| Score clears the bar **and** FOIR is within limit | ≥ 750 and ≤ 50% | Auto-approved |
| Anything else | 600–749 | Routed to a credit officer |

FOIR is the new EMI plus existing EMIs as a share of income.

### Rate by score band

| Band | Score | Rate |
|---|---|---|
| Excellent | 800–900 | 11.5% p.a. |
| Very good | 750–799 | 13.5% p.a. |
| Good | 700–749 | 16.0% p.a. |
| Fair | 650–699 | 19.0% p.a. |
| Poor | 300–649 | 23.0% p.a. |

## Servicing

12. **Customer → My loans → Pay now.** The amount is pre-filled with the oldest
    installment's dues. The mocked gateway settles immediately; the receipt
    appears in the ledger and the installment flips to *Paid*.
13. **Overdue accounts** age into **1–30 / 31–60 / 61–90 / 90+** day buckets
    with a **2% late penalty** accruing. A **collections officer** filters by
    bucket, sends bulk reminders and logs follow-up notes.
14. **Closure** — run to term, or **foreclose** early. The quote is outstanding
    principal + accrued interest + a **3% foreclosure charge**. On settlement a
    **No-Dues Certificate** PDF becomes downloadable. That is the end of the
    lifecycle.

## Product limits

| | |
|---|---|
| Amount | ₹50,000 – ₹20,00,000 |
| Tenure | 6 – 60 months |
| Interest | 10.5% – 24% p.a. |
| Processing fee | 2% of sanctioned amount |
| Late penalty | 2% |
| Foreclosure charge | 3% |

## Two differences on a deployed instance

**The score band selector does nothing.** `simulate` is honoured only when
`ENABLE_TEST_HOOKS=true`, which is off in production — so the credit check
always draws a random score and the branch varies run to run. Run locally with
test hooks on if you need a specific outcome for a scripted demo.

**Uploaded files do not survive a redeploy.** Documents are written to the API's
local disk and Render's filesystem is ephemeral. The database rows persist, so
the UI keeps listing files whose bytes are gone. A persistent disk or object
storage is the fix for anything real.
