/**
 * Usage settings section: balance card, usage rollup, category breakdown,
 * a daily-token bar chart, and the platform-token credential control. Pure
 * presentation over the injected `useUsage` hook and the three callbacks.
 */

import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UsageSnapshot } from '@deepseek-ai/dsh-usage-deepseek/client'
import clsx from 'clsx'
import type { UsageFace, UsageState } from './usage-controller.ts'
import type { UsageKey } from './locales.ts'
import css from './UsageSettingsSection.module.css'

/** Props the renderer binds for the section. */
export type UsageSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'usage'>
  & InjectFace<UsageFace>

/** Currency symbol for rendering. */
function symbol(currency: string): string {
  return currency === 'CNY' ? '¥' : '$'
}

/** Group an integer with thousands separators. */
function group(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Format a cost with a currency symbol. */
function money(value: number, currency: string): string {
  return `${symbol(currency)}${value.toFixed(4)}`
}

/** Render the whole Usage page. */
export function UsageSettingsSection({ t, useUsage, refresh, setToken, clearToken }: UsageSettingsSectionProps) {
  const state = useUsage(value => value)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void refresh() }, [refresh])

  const save = async () => {
    setBusy(true)
    try {
      await setToken(draft.trim())
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      setDraft('')
      await clearToken()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.section}>
      <div className={css.header}>
        <div>
          <h2 className={css.heading}>{t('title')}</h2>
          <p className={css.intro}>{t('intro')}</p>
        </div>
        <button type="button" className={css.button} onClick={() => { void refresh() }} disabled={state.loading}>
          {t('refresh')}
        </button>
      </div>

      <TokenCard
        t={t}
        state={state}
        draft={draft}
        busy={busy}
        onDraft={setDraft}
        onSave={() => { void save() }}
        onClear={() => { void clear() }}
      />

      {state.loading && <p className={css.hint}>{t('loading')}</p>}
      {state.error !== null && <p className={css.hint}>{state.error}</p>}
      <SnapshotView t={t} snapshot={state.snapshot} />
    </div>
  )
}

interface TokenCardProps {
  t: (key: UsageKey) => string
  state: UsageState
  draft: string
  busy: boolean
  onDraft: (value: string) => void
  onSave: () => void
  onClear: () => void
}

/** Platform-token credential control: a write-only input plus config state. */
function TokenCard({ t, state, draft, busy, onDraft, onSave, onClear }: TokenCardProps) {
  return (
    <section className={css.card}>
      <div className={css.cardTitleRow}>
        <h3 className={css.cardTitle}>{t('tokenSection')}</h3>
        <span className={state.tokenConfigured ? css.badgeOn : css.badgeOff}>
          {state.tokenConfigured ? t('tokenConfigured') : t('tokenNotConfigured')}
        </span>
      </div>
      <p className={css.cardIntro}>{t('tokenIntro')}</p>
      <form
        className={css.tokenForm}
        onSubmit={(event) => { event.preventDefault(); onSave() }}
      >
        <input
          className={css.input}
          type="password"
          autoComplete="off"
          placeholder={t('tokenPlaceholder')}
          value={draft}
          disabled={busy || !state.tokenWritable}
          onChange={(event) => { onDraft(event.target.value) }}
        />
        <button type="submit" className={css.button} disabled={busy || draft.trim().length === 0}>
          {t('saveToken')}
        </button>
        {state.tokenConfigured && (
          <button type="button" className={clsx(css.button, css.buttonGhost)} onClick={onClear} disabled={busy}>
            {t('clearToken')}
          </button>
        )}
      </form>
    </section>
  )
}

interface SnapshotViewProps {
  t: (key: UsageKey) => string
  snapshot: UsageSnapshot | null
}

/** Props for the balance/usage cards, which only render a non-null snapshot. */
interface SnapshotCardProps {
  t: (key: UsageKey) => string
  snapshot: UsageSnapshot
}

/** Render balance, usage rollup, breakdown, chart, and notices. */
function SnapshotView({ t, snapshot }: SnapshotViewProps) {
  if (snapshot === null) return null
  return (
    <>
      <BalanceCard t={t} snapshot={snapshot} />
      <UsageCard t={t} snapshot={snapshot} />
      {snapshot.notices.length > 0 && (
        <section className={css.card}>
          <h3 className={css.cardTitle}>{t('noticesTitle')}</h3>
          <ul className={css.notices}>
            {snapshot.notices.map(notice => <li key={notice}>{notice}</li>)}
          </ul>
        </section>
      )}
    </>
  )
}

function BalanceCard({ t, snapshot }: SnapshotCardProps) {
  const balance = snapshot.balance
  if (balance === null) {
    return (
      <section className={css.card}>
        <h3 className={css.cardTitle}>{t('balanceTitle')}</h3>
        <p className={css.hint}>{t('noBalance')}</p>
      </section>
    )
  }
  return (
    <section className={css.card}>
      <h3 className={css.cardTitle}>{t('balanceTitle')}</h3>
      <div className={css.balanceValue}>
        {symbol(balance.currency)}{balance.totalBalance.toFixed(2)}
      </div>
      <div className={css.balanceDetail}>
        <span>{t('toppedUp')} {symbol(balance.currency)}{balance.toppedUpBalance.toFixed(2)}</span>
        <span>{t('granted')} {symbol(balance.currency)}{balance.grantedBalance.toFixed(2)}</span>
      </div>
      {!balance.isAvailable && <p className={css.warn}>{t('unavailable')}</p>}
    </section>
  )
}

function UsageCard({ t, snapshot }: SnapshotCardProps) {
  const usage = snapshot.usage
  if (usage === null) {
    return (
      <section className={css.card}>
        <h3 className={css.cardTitle}>{t('usageTitle')}</h3>
        <p className={css.hint}>{t('noUsage')}</p>
      </section>
    )
  }
  const dailyMax = usage.daily.reduce((max, day) => Math.max(max, day.tokens), 0)
  return (
    <section className={css.card}>
      <h3 className={css.cardTitle}>{t('usageTitle')}</h3>
      <div className={css.metrics}>
        <Metric label={t('today')} value={`${group(usage.todayTokens)} tokens`} />
        <Metric label={t('month')} value={`${group(usage.currentMonthTokens)} tokens`} />
        <Metric label={t('cost')} value={money(usage.currentMonthCost, usage.currency)} />
        <Metric label={t('requests')} value={String(usage.currentMonthRequestCount)} />
      </div>
      {usage.topModel !== null && (
        <p className={css.topModel}>{t('topModel')}：{usage.topModel}</p>
      )}
      <h4 className={css.subTitle}>{t('categoriesTitle')}</h4>
      <ul className={css.categories}>
        {usage.categories.map(category => (
          <li key={category.category} className={css.categoryRow}>
            <span className={css.categoryName}>{categoryLabel(t, category.category)}</span>
            <span className={css.categoryAmount}>{group(category.amount)}</span>
          </li>
        ))}
      </ul>
      <h4 className={css.subTitle}>{t('dailyTitle')}</h4>
      <div className={css.chart} role="img" aria-label={t('dailyTitle')}>
        {usage.daily.map(day => (
          <div key={day.date} className={css.chartColumn}>
            <div
              className={css.chartBar}
              style={dailyMax === 0 ? undefined : { height: `${Math.max(2, (day.tokens / dailyMax) * 100)}%` }}
            />
            <span className={css.chartLabel}>{day.date.slice(-2)}</span>
          </div>
        ))}
        {usage.daily.length === 0 && <p className={css.hint}>{t('noUsage')}</p>}
      </div>
    </section>
  )
}

interface MetricProps {
  label: string
  value: string
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className={css.metric}>
      <div className={css.metricValue}>{value}</div>
      <div className={css.metricLabel}>{label}</div>
    </div>
  )
}

/** Localized category label. */
function categoryLabel(t: (key: UsageKey) => string, category: string): string {
  switch (category) {
    case 'cache-hit': return t('cacheHit')
    case 'cache-miss': return t('cacheMiss')
    case 'output': return t('output')
    case 'request': return t('request')
    /* v8 ignore next -- usage categories are the closed union */
    default: return category
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Usage section copy. */
    usage: UsageKey
  }
}
