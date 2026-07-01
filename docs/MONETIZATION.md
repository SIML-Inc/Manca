# Manca Monetization

The premise: **transaction tolls are dead** (OpenAI's 4% ACP fee was rolled back within
weeks; Perplexity went zero‑fee and won). Manca never taxes *access*. Every stream prices
*risk removal*, *time‑value of money*, or *realized savings* — things with real marginal
value that don't compress to zero. The network is profitable on its first cleared trade.

All parameters live in [`manca.config.json`](../manca.config.json).

## 1. Clearing + guarantee fee — `clearing.clearingFeeBps`
A few bps on cleared value, taken because Manca *guarantees settlement* (escrow + verified
delivery), not because it sits in the pipe. Payer is configurable (`buyer`/`seller`/`split`).
Default 50 bps.

## 2. Float yield — `float.floatApyBps`
Funds sit in escrow between match and verified delivery. Manca earns the yield on that
in‑flight balance (interest from the settlement‑asset custodian, e.g. USDC reserves). Scales
automatically with volume × time‑in‑escrow. Default 4.2% APY.

## 3. Savings share — `savingsShare.savingsShareBps`
When a buy mandate declares a `referencePrice` (what the buyer would otherwise pay) and Manca
clears below it, Manca takes a share of the delta. Perfectly aligned: revenue only when the
buyer is measurably better off. Default 15% of savings.

## 4. Fulfillment insurance — `insurance.premiumBps`
Buyers can opt a mandate `insured: true`. A **risk‑priced** premium (higher for lower‑
reputation sellers) is reserved into an insurance pool at match. On clean settlement the
premium is **earned** (moves from pool to revenue). On failure the buyer is refunded from
escrow **and** paid coverage from the pool; the payout nets against the insurance line. Over
many trades with low failure rates, premiums > payouts. Default 200 bps base, up to ~3× as
reputation → 0.

## 5. Verified supply — `verifiedSupply.subscriptionMonthlyUsd`
Sellers pay a recurring subscription to be verified, eligible, and discoverable. Flat SaaS
revenue independent of any single trade. Default $99/mo.

## Worked example (from `npm run demo`)

Two settled digital trades + one failed insured trade + three verified suppliers:

```
verified_supply_subscription   $297.0000   (3 × $99)
clearing_fee                   $0.8000     (50 bps on $160 cleared)
savings_share                  $6.0000     (15% of $40 realized savings)
insurance_premium              $2.9830     ($3.768 earned − $0.785 payout)
TOTAL NETWORK REVENUE          $306.7830
```

## How this scales to a real business

- **Clearing + insurance** = the counterparty‑risk business (priced on risk, defensible by
  the reputation graph). This is the durable core.
- **Float** = balance‑sheet income that grows with GMV in escrow, no pricing pressure.
- **Verified‑supply + savings‑share** = predictable SaaS + aligned upside.

None of these is a "% of every transaction" toll. That's the point.
