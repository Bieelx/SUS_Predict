import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const API = 'http://localhost:8000'

const NAV_ITEMS = [
  { key: 'overview', label: 'Visão Geral', icon: '🏠' },
  { key: 'download', label: 'Baixar Dados', icon: '⬇️' },
  { key: 'mapa', label: 'Mapa de Risco', icon: '🗺️' },
  { key: 'superlotacao', label: 'Superlotação', icon: '🏥' },
  { key: 'insumos', label: 'Ruptura de Insumos', icon: '💊' },
  { key: 'financeiro', label: 'Pressão Financeira', icon: '💰' },
  { key: 'alertas', label: 'Alertas', icon: '🔔' },
  { key: 'config', label: 'Configurações', icon: '⚙️' },
]

const SISTEMA_META = {
  SIM: { label: 'Mortalidade', metric: 'óbitos', icon: '💀', accent: '#DC2626', soft: '#FEE2E2' },
  SIH: { label: 'Internações', metric: 'internações', icon: '🏥', accent: '#2563EB', soft: '#DBEAFE' },
  SINASC: { label: 'Nascimentos', metric: 'nascimentos', icon: '👶', accent: '#16A34A', soft: '#DCFCE7' },
  SIA: { label: 'Ambulatorial', metric: 'atendimentos', icon: '🩺', accent: '#0F766E', soft: '#CCFBF1' },
  SINAN: { label: 'Vigilância Epidemiológica', metric: 'notificações', icon: '🦠', accent: '#D97706', soft: '#FEF3C7' },
}

const STEP_LABELS = ['Base DATASUS', 'Localização', 'Confirmação']
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const fmtN = (n) => n?.toLocaleString('pt-BR') ?? '—'
const fmtPct = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`)
const cx = (...classes) => classes.filter(Boolean).join(' ')

function AppShell({ activeView, onChangeView, topbar, children }) {
  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-slate-800">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="w-full bg-[var(--navy)] text-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:flex-shrink-0">
          <div className="flex h-full flex-col px-4 py-5">
            <div className="mb-8 flex items-center gap-3 px-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 text-xl shadow-lg shadow-slate-950/20">
                🏥
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide text-white">SUS Predict</p>
                <p className="text-xs text-sky-200/80">Monitoramento e previsão SUS</p>
              </div>
            </div>

            <nav className="space-y-1.5">
              {NAV_ITEMS.map((item) => {
                const active = activeView === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => onChangeView(item.key)}
                    className={cx(
                      'relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-all',
                      active ? 'bg-[var(--blue-500)] text-white shadow-lg shadow-blue-950/25' : 'text-sky-200/80 hover:bg-white/8 hover:text-white',
                    )}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-white" />}
                    <span className="text-base">{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </button>
                )
              })}
            </nav>

            <div className="mt-auto rounded-2xl border border-white/10 bg-white/8 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
                  US
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Usuário</p>
                  <p className="text-xs text-sky-200/75">Gestor Municipal</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              {topbar}
            </div>
          </header>

          <main className="flex-1 px-4 py-5 md:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  )
}

function SurfaceCard({ children, className = '' }) {
  return (
    <div className={cx('rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.06)]', className)}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{children}</p>
}

function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 bg-slate-100 text-slate-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    yellow: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  }
  return <span className={cx('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold', tones[tone])}>{children}</span>
}

function LightTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((item) => (
        <div key={item.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span>{item.name}: {fmtN(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

function StepPills({ step }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {STEP_LABELS.map((label, index) => {
        const current = index + 1
        const active = current === step
        const done = current < step
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cx(
                'flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold',
                done && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                active && 'border-blue-200 bg-blue-50 text-blue-700',
                !done && !active && 'border-slate-200 bg-white text-slate-500',
              )}
            >
              <span
                className={cx(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                  done && 'bg-emerald-500 text-white',
                  active && 'bg-blue-600 text-white',
                  !done && !active && 'bg-slate-100 text-slate-500',
                )}
              >
                {done ? '✓' : current}
              </span>
              {label}
            </div>
            {index < STEP_LABELS.length - 1 && <span className="hidden h-px w-6 bg-slate-200 sm:block" />}
          </div>
        )
      })}
    </div>
  )
}

function ExtractionWorkspace(props) {
  const {
    step,
    sistema,
    setSistema,
    estados,
    cidades,
    uf,
    setUf,
    cidade,
    setCidade,
    ibge,
    setIbge,
    anoIni,
    setAnoIni,
    anoFim,
    setAnoFim,
    anoLimites,
    doencas,
    doenca,
    setDoenca,
    onLoadCidades,
    onNext,
    onBack,
    onConfirm,
    loading,
  } = props

  const sistemaInfo = SISTEMA_META[sistema] ?? null
  const limiteInfo = anoLimites[sistema] ?? {}
  const anoMaximo = limiteInfo.ano_maximo ?? 2024
  const defasagem = limiteInfo.defasagem_anos ?? 2
  const doencaNome = doencas.find((item) => item.codigo === doenca)?.nome ?? doenca

  const handleSistema = (codigo) => {
    setSistema(codigo)
    setDoenca('')
  }

  const handleUf = (event) => {
    const sigla = event.target.value
    setUf(sigla)
    setCidade('')
    setIbge('')
    if (sigla) onLoadCidades(sigla)
  }

  const handleCidade = (event) => {
    const nome = event.target.value
    const municipio = cidades.find((item) => item.nome === nome)
    setCidade(nome)
    setIbge(municipio?.ibge ?? '')
  }

  const handleAnoIni = (event) => {
    const valor = Math.min(Number(event.target.value), anoMaximo)
    setAnoIni(valor)
    if (anoFim > anoMaximo) setAnoFim(anoMaximo)
  }

  const handleAnoFim = (event) => {
    const valor = Math.min(Number(event.target.value), anoMaximo)
    setAnoFim(valor)
  }

  const validBase = uf && cidade && anoIni >= 2000 && anoFim >= anoIni && anoFim <= anoMaximo && anoIni <= anoMaximo
  const valid = sistema === 'SINAN' ? validBase && !!doenca : validBase
  const inputCls = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100'

  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
      <SurfaceCard>
        <SectionLabel>Nova análise</SectionLabel>
        <h1 className="text-2xl font-bold text-slate-900">Configuração da extração DATASUS</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          O redesign já está alinhado com a nova identidade visual, mas o motor continua o mesmo:
          selecionar, baixar, processar e transformar os dados públicos do SUS em análise rápida para o TCC.
        </p>

        <StepPills step={step} />

        {step === 1 && (
          <div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Escolha a base do DATASUS</h2>
                <p className="text-sm text-slate-500">Cada módulo alimenta cards, alertas e visualizações do dashboard.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(SISTEMA_META).map(([codigo, meta]) => {
                const active = sistema === codigo
                return (
                  <button
                    key={codigo}
                    onClick={() => handleSistema(codigo)}
                    className={cx(
                      'rounded-2xl border p-5 text-left transition-all',
                      active ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-3xl">{meta.icon}</span>
                      <Badge tone={active ? 'blue' : 'slate'}>{codigo}</Badge>
                    </div>
                    <p className="font-semibold text-slate-900">{meta.label}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Base orientada a {meta.metric}. Ideal para análise acadêmica e simulação de riscos operacionais.
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={onNext}
                disabled={!sistema}
                className="rounded-xl bg-[var(--blue-500)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--blue-600)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Localização e recorte temporal</h2>
              <p className="text-sm text-slate-500">Defina município, período e, no caso do SINAN, o agravo a ser observado.</p>
            </div>

            {sistema === 'SINAN' && (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Doença / Agravo</label>
                <select value={doenca} onChange={(event) => setDoenca(event.target.value)} className={inputCls}>
                  <option value="">Selecione a doença</option>
                  {doencas.map((item) => (
                    <option key={item.codigo} value={item.codigo}>{item.nome}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Estado</label>
                <select value={uf} onChange={handleUf} className={inputCls}>
                  <option value="">Selecione o estado</option>
                  {estados.map((estado) => (
                    <option key={estado.sigla} value={estado.sigla}>{estado.sigla} — {estado.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Município</label>
                <select value={cidade} onChange={handleCidade} disabled={!uf || !cidades.length} className={inputCls}>
                  <option value="">Selecione o município</option>
                  {cidades.map((item) => (
                    <option key={item.ibge} value={item.nome}>{item.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ano inicial</label>
                <input type="number" min="2000" max={anoMaximo} value={anoIni} onChange={handleAnoIni} className={inputCls} />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ano final</label>
                <input type="number" min={anoIni} max={anoMaximo} value={anoFim} onChange={handleAnoFim} className={inputCls} />
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <strong>Dados consolidados:</strong> o sistema {sistema || 'selecionado'} trabalha melhor com dados até {anoMaximo},
              considerando aproximadamente {defasagem} anos de defasagem no DATASUS.
            </div>

            {ibge && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Código IBGE identificado: <strong>{ibge}</strong>
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-3">
              <button
                onClick={onBack}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Voltar
              </button>
              <button
                onClick={onNext}
                disabled={!valid}
                className="rounded-xl bg-[var(--blue-500)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--blue-600)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Revisar parâmetros
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Confirmação da execução</h2>
              <p className="text-sm text-slate-500">Revise os parâmetros antes de iniciar o job de download e análise.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50">
              {[
                ['Sistema', sistemaInfo ? `${sistemaInfo.icon} ${sistema} — ${sistemaInfo.label}` : '—'],
                ['Estado', uf || '—'],
                ['Município', cidade || '—'],
                ['Código IBGE', ibge || '—'],
                ['Período', `${anoIni} → ${anoFim}`],
                ...(sistema === 'SINAN' ? [['Doença', doencaNome || '—']] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm last:border-b-0">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-800">{value}</span>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              A extração usa dados reais do DATASUS via backend FastAPI. Para recortes grandes, o FTP pode levar alguns minutos.
            </div>

            <div className="flex flex-wrap justify-between gap-3">
              <button
                onClick={onBack}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Ajustar filtros
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Iniciando...' : 'Iniciar extração'}
              </button>
            </div>
          </div>
        )}
      </SurfaceCard>

      <div className="space-y-5">
        <SurfaceCard className="bg-[linear-gradient(145deg,#1A2E6B,#27417D)] text-white">
          <SectionLabel>Resumo executivo</SectionLabel>
          <h2 className="text-xl font-bold text-white">Painel pronto para o TCC</h2>
          <p className="mt-2 text-sm leading-6 text-sky-100/85">
            O objetivo aqui é unir uma navegação mais executiva, no estilo dashboard corporativo, ao fluxo real de ingestão
            dos dados do SUS que você já tem funcionando.
          </p>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-sky-100/70">Fluxo de produção</p>
              <p className="mt-2 text-sm text-white">Seleciona → baixa → sobe no Supabase → mostra dashboard → compacta</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-sky-100/70">Fluxo de teste</p>
              <p className="mt-2 text-sm text-white">Seleciona → baixa simulado → mostra dashboard → deleta localmente</p>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionLabel>Compatibilidade</SectionLabel>
          <div className="space-y-3 text-sm text-slate-600">
            <p><strong className="text-slate-800">Backend:</strong> FastAPI + PySUS com preferência por Python 3.12.</p>
            <p><strong className="text-slate-800">Frontend:</strong> React + Tailwind + Recharts, agora com layout executivo e módulos internos.</p>
            <p><strong className="text-slate-800">Perfil de uso:</strong> secretário ou gestor municipal que precisa bater o olho e decidir rápido.</p>
          </div>
        </SurfaceCard>
      </div>
    </div>
  )
}

function LoadingState({ sistema, cidade, uf, progresso, mensagem }) {
  const meta = SISTEMA_META[sistema] ?? SISTEMA_META.SIH
  const steps = [
    { label: 'Conectando ao FTP do DATASUS', done: progresso > 8 },
    { label: 'Baixando arquivos e filtrando recorte', done: progresso > 35 },
    { label: 'Processando distribuição e série temporal', done: progresso > 62 },
    { label: 'Montando indicadores e previsões', done: progresso > 82 },
    { label: 'Finalizando dashboard', done: progresso >= 100 },
  ]

  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <SurfaceCard className="bg-[linear-gradient(145deg,#1A2E6B,#27417D)] text-white">
        <SectionLabel>Job em execução</SectionLabel>
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/12 text-4xl">{meta.icon}</div>
          <div>
            <h1 className="text-2xl font-bold text-white">Processando dados do DATASUS</h1>
            <p className="mt-1 text-sm text-sky-100/80">{meta.label} · {cidade || 'Município'} / {uf || 'UF'}</p>
            <p className="mt-4 text-sm leading-6 text-sky-50">{mensagem || 'Organizando arquivos e consolidando indicadores.'}</p>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-2 flex items-center justify-between text-sm text-sky-100">
            <span>Progresso do job</span>
            <span>{progresso}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/12">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#60A5FA,#34D399)] transition-all duration-700"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionLabel>Pipeline</SectionLabel>
        <div className="space-y-3">
          {steps.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <span className={cx('flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold', item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                {item.done ? '✓' : '•'}
              </span>
              <span className={cx('text-sm', item.done ? 'font-semibold text-slate-900' : 'text-slate-500')}>{item.label}</span>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <SurfaceCard className="mx-auto max-w-2xl text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-3xl">⚠️</div>
      <h1 className="text-2xl font-bold text-slate-900">O backend não respondeu</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{message}</p>

      <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-left">
        <SectionLabel>Como iniciar o backend</SectionLabel>
        <code className="block whitespace-pre-wrap text-xs leading-6 text-emerald-700">
          cd api{'\n'}
          pip install -r requirements_api.txt{'\n'}
          uvicorn main:app --reload --port 8000
        </code>
      </div>

      <button onClick={onRetry} className="mt-6 rounded-xl bg-[var(--blue-500)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--blue-600)]">
        Tentar novamente
      </button>
    </SurfaceCard>
  )
}

function EmptyModule({ title, description }) {
  return (
    <SurfaceCard className="mx-auto max-w-3xl text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-3xl">📊</div>
      <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        Inicie uma extração na aba <strong>Visão Geral</strong> para popular este módulo com dados reais do seu fluxo DATASUS.
      </div>
    </SurfaceCard>
  )
}

function BrazilMap({ runs, selectedRunId, onSelectRun }) {
  // Brasil (aprox.) em equiretangular: bounds para posicionar pins.
  const bounds = { minLon: -74.0, maxLon: -34.0, minLat: -34.0, maxLat: 6.0 }
  const width = 760
  const height = 520

  const project = (lat, lon) => {
    const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * width
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height
    return { x, y }
  }

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top,#dbeafe,transparent_38%),linear-gradient(180deg,#f8fbff_0%,#edf4fb_100%)]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[520px] w-full">
        {/* Silhueta simplificada (estilo) */}
        <path
          d="M224 86 L300 58 L360 70 L404 112 L450 120 L498 154 L550 176 L604 246 L594 304 L560 340 L548 398 L504 444 L454 464 L420 438 L380 446 L352 420 L326 420 L304 388 L266 392 L240 360 L214 330 L198 288 L172 248 L160 196 L182 152 Z"
          fill="rgba(191,219,254,0.85)"
          stroke="rgba(59,130,246,0.45)"
          strokeWidth="2"
        />

        {/* Pins reais: só plota se tiver lat/lon */}
        {runs
          .filter((r) => r.lat != null && r.lon != null)
          .map((r) => {
            const { x, y } = project(r.lat, r.lon)
            const active = r.run_id === selectedRunId
            return (
              <g key={r.run_id} transform={`translate(${x}, ${y})`} onClick={() => onSelectRun(r.run_id)} style={{ cursor: 'pointer' }}>
                <circle r={active ? 9 : 7} fill={active ? '#ef4444' : '#2563eb'} stroke="#fff" strokeWidth="3" />
                <circle r="18" fill={active ? 'rgba(239,68,68,0.12)' : 'rgba(37,99,235,0.12)'} />
              </g>
            )
          })}
      </svg>
    </div>
  )
}

function toRealAnalytics(resultado, sistema, cidade, uf, anoIni, anoFim) {
  if (!resultado) return null

  const stats = resultado.stats ?? {}
  const serie = Array.isArray(resultado.serie_com_previsao) ? resultado.serie_com_previsao : []
  const faixaEtaria = Array.isArray(resultado.distribuicao_faixa_etaria) ? resultado.distribuicao_faixa_etaria : []
  const sexo = Array.isArray(resultado.distribuicao_sexo) ? resultado.distribuicao_sexo : []
  const topCausas = Array.isArray(resultado.top_causas) ? resultado.top_causas : []
  const meta = SISTEMA_META[sistema] ?? null

  const temPrevisao = serie.some((item) => item?.tipo === 'previsto')

  const chartData = serie.map((item) => ({
    ano: item.ano,
    real: item.tipo === 'real' ? item.total : null,
    previsto: item.tipo === 'previsto' ? item.total : null,
    upper: item.tipo === 'previsto' ? (item.upper ?? null) : null,
    lower: item.tipo === 'previsto' ? (item.lower ?? null) : null,
  }))

  const temIC = chartData.some((item) => item.upper != null || item.lower != null)
  const prevCards = serie.filter((item) => item?.tipo === 'previsto')

  const barsData = faixaEtaria.map((item, index) => ({
    ...item,
    fill: ['#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'][index % 6],
  }))

  const pieData = sexo.map((item, index) => ({
    ...item,
    fill: index === 0 ? '#2563EB' : '#16A34A',
  }))

  return {
    stats,
    meta,
    sistema,
    cidade,
    uf,
    anoIni,
    anoFim,
    chartData,
    temPrevisao,
    temIC,
    prevCards,
    barsData,
    pieData,
    topCausas,
  }
}

function OverviewPage({ analytics, onCleanup, onExportXlsx, exportingXlsx, cleaningUp, jobId }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <SectionLabel>Visão geral</SectionLabel>
          <h1 className="text-2xl font-bold text-slate-900">{analytics.meta?.icon ?? '📊'} {analytics.sistema} — {analytics.meta?.label ?? 'Análise DATASUS'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {analytics.cidade}, {analytics.uf} · série {analytics.anoIni}–{analytics.anoFim}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green">Dados reais DATASUS</Badge>
          <Badge tone="blue">Job {jobId}</Badge>
          <button
            onClick={onExportXlsx}
            disabled={exportingXlsx}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportingXlsx ? 'Exportando...' : 'Exportar XLSX'}
          </button>
          <button
            onClick={onCleanup}
            disabled={cleaningUp}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cleaningUp ? 'Limpando...' : 'Limpar dados locais'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <SurfaceCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-xl">📦</div>
            <Badge tone="blue">{analytics.sistema}</Badge>
          </div>
          <p className="text-sm text-slate-500">Total de registros</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{fmtN(analytics.stats.total)}</p>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-xl">📈</div>
            <Badge tone="slate">{fmtN(analytics.stats.anos_analisados)} anos</Badge>
          </div>
          <p className="text-sm text-slate-500">Média anual</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{fmtN(analytics.stats.media_anual)}</p>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-xl">🧭</div>
            <Badge tone={(analytics.stats.variacao_pct ?? 0) >= 0 ? 'yellow' : 'green'}>{fmtPct(analytics.stats.variacao_pct)}</Badge>
          </div>
          <p className="text-sm text-slate-500">Variação no período</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{fmtPct(analytics.stats.variacao_pct)}</p>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-xl">🔮</div>
            <Badge tone="blue">{analytics.temPrevisao ? 'Previsão' : 'Sem previsão'}</Badge>
          </div>
          <p className="text-sm text-slate-500">Próxima previsão</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{fmtN(analytics.stats.prox_previsao)}</p>
        </SurfaceCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.65fr_0.95fr]">
        <SurfaceCard>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <SectionLabel>Série temporal</SectionLabel>
              <h2 className="text-lg font-bold text-slate-900">Histórico e previsão (se disponível)</h2>
            </div>
            <Badge tone="blue">{analytics.temPrevisao ? 'Real + previsto' : 'Apenas real'}</Badge>
          </div>

          {analytics.chartData.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              O backend não retornou série temporal para essa extração.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={analytics.chartData} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="ano" tick={{ fill: '#64748B', fontSize: 12 }} stroke="#CBD5E1" />
                <YAxis tick={{ fill: '#64748B', fontSize: 12 }} stroke="#CBD5E1" />
                <Tooltip content={<LightTooltip />} />
                {analytics.temPrevisao && <ReferenceLine x={analytics.anoFim} stroke="#94A3B8" strokeDasharray="6 4" />}
                {analytics.temIC && (
                  <>
                    <Line type="monotone" dataKey="upper" name="limite superior" stroke="#D97706" strokeWidth={1.5} strokeOpacity={0.35} dot={false} legendType="none" />
                    <Line type="monotone" dataKey="lower" name="limite inferior" stroke="#D97706" strokeWidth={1.5} strokeOpacity={0.35} dot={false} legendType="none" />
                  </>
                )}
                <Line type="monotone" dataKey="real" name="real" stroke="#2563EB" strokeWidth={3} dot={{ r: 3 }} connectNulls={false} />
                {analytics.temPrevisao && (
                  <Line type="monotone" dataKey="previsto" name="previsto" stroke="#D97706" strokeWidth={3} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}

          {analytics.prevCards.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {analytics.prevCards.map((item) => (
                <div key={item.ano} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item.ano}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{fmtN(item.total)}</p>
                  {item.lower != null && item.upper != null && (
                    <p className="mt-1 text-xs text-slate-500">IC: {fmtN(item.lower)} – {fmtN(item.upper)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <SectionLabel>Principais categorias</SectionLabel>
          <h2 className="text-lg font-bold text-slate-900">Top causas / diagnósticos</h2>
          {analytics.topCausas.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              O backend não retornou `top_causas` para este sistema/recorte.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {analytics.topCausas.map((item, index) => (
                <div key={`${item.causa}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-slate-900">{item.causa}</p>
                    <Badge tone="blue">{item.pct}%</Badge>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${clamp(Number(item.pct ?? 0), 0, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SurfaceCard>
          <SectionLabel>Distribuições</SectionLabel>
          <h2 className="text-lg font-bold text-slate-900">Faixa etária</h2>
          {analytics.barsData.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              O backend não retornou `distribuicao_faixa_etaria` para este sistema/recorte.
            </div>
          ) : (
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={analytics.barsData}>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                  <XAxis dataKey="faixa" tick={{ fill: '#64748B', fontSize: 10 }} stroke="#CBD5E1" />
                  <YAxis tick={{ fill: '#64748B', fontSize: 11 }} stroke="#CBD5E1" />
                  <Tooltip content={<LightTooltip />} />
                  <Bar dataKey="pct" name="%">
                    {analytics.barsData.map((item) => (
                      <Cell key={item.faixa} fill={item.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard>
          <SectionLabel>Distribuições</SectionLabel>
          <h2 className="text-lg font-bold text-slate-900">Sexo</h2>
          {analytics.pieData.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              O backend não retornou `distribuicao_sexo` para este sistema/recorte.
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-4 md:flex-row md:justify-between">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={analytics.pieData} dataKey="pct" nameKey="sexo" outerRadius={78} innerRadius={46}>
                    {analytics.pieData.map((item) => (
                      <Cell key={item.sexo} fill={item.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<LightTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {analytics.pieData.map((item) => (
                  <div key={item.sexo} className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.fill }} />
                    <div>
                      <p className="text-base font-semibold text-slate-900">{item.pct}%</p>
                      <p className="text-xs text-slate-500">{item.sexo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SurfaceCard>
      </div>
    </div>
  )
}

function MapPage({ analytics }) {
  const [runs, setRuns] = useState([])
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [runsError, setRunsError] = useState(null)
  const [category, setCategory] = useState(analytics?.sistema ?? '')
  const [selectedRunId, setSelectedRunId] = useState(null)

  useEffect(() => {
    let mounted = true
    const fetchRuns = async () => {
      setLoadingRuns(true)
      setRunsError(null)
      try {
        const q = category ? `?sistema=${encodeURIComponent(category)}` : ''
        const r = await fetch(`${API}/api/runs${q}`)
        const d = await r.json().catch(() => null)
        if (!mounted) return
        if (!d?.ok && d?.error) {
          setRunsError(String(d.error))
        }
        const list = d?.runs && Array.isArray(d.runs) ? d.runs : []
        setRuns(list)
        setSelectedRunId(list[0]?.run_id ?? null)
      } catch {
        if (!mounted) return
        setRunsError('Falha ao carregar runs do Supabase.')
        setRuns([])
      }
      setLoadingRuns(false)
    }
    fetchRuns()
    return () => { mounted = false }
  }, [category])

  const visibleRuns = runs.filter((r) => r.lat != null && r.lon != null)
  const selected = runs.find((r) => r.run_id === selectedRunId) ?? null

  return (
    <div className="grid gap-5 xl:grid-cols-[1.55fr_0.85fr]">
      <SurfaceCard>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionLabel>Mapa de risco</SectionLabel>
            <h1 className="text-2xl font-bold text-slate-900">Brasil: cidades com dados carregados</h1>
            <p className="mt-1 text-sm text-slate-500">
              Pins são gerados somente a partir de execuções reais salvas no Supabase.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Todas as categorias</option>
              {Object.keys(SISTEMA_META).map((cod) => (
                <option key={cod} value={cod}>{cod} — {SISTEMA_META[cod].label}</option>
              ))}
            </select>
            <Badge tone="blue">{loadingRuns ? 'Carregando...' : `${visibleRuns.length} cidade(s)`}</Badge>
          </div>
        </div>

        {runsError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            {runsError}
          </div>
        ) : visibleRuns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            Nenhuma cidade com coordenadas disponível ainda. Por enquanto o backend só conhece as coordenadas de São Paulo.
          </div>
        ) : (
          <BrazilMap runs={visibleRuns} selectedRunId={selectedRunId} onSelectRun={setSelectedRunId} />
        )}
      </SurfaceCard>

      <SurfaceCard className="flex flex-col">
        <SectionLabel>Detalhes do pin</SectionLabel>
        {!selected ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            Selecione um pin no mapa para ver os detalhes do run.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cidade</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{selected.cidade} — {selected.uf}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="blue">{selected.sistema}</Badge>
                {selected.doenca_cod ? <Badge tone="yellow">{selected.doenca_cod}</Badge> : <Badge tone="slate">—</Badge>}
                <Badge tone="slate">{selected.ano_ini}–{selected.ano_fim}</Badge>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Run</p>
              <p className="mt-2 font-mono text-sm text-slate-700">{selected.run_id}</p>
              <p className="mt-2 text-sm text-slate-500">Modelo: <strong className="text-slate-800">{selected.modelo ?? '—'}</strong></p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
              Dica: para popular mais pins, rode novas extrações na aba <strong>Baixar Dados</strong>.
            </div>
          </div>
        )}
      </SurfaceCard>
    </div>
  )
}

function SuperlotacaoPage({ analytics }) {
  return (
    <EmptyModule
      title="Superlotação Hospitalar"
      description="Sem dados fictícios: este módulo só será exibido quando o backend expor métricas reais de ocupação (ex: SIH + CNES com cálculo de leitos e taxa de ocupação)."
    />
  )
}

function AlertasPage({ analytics }) {
  return (
    <EmptyModule
      title="Central de Alertas"
      description="Sem dados fictícios: este módulo só será exibido quando o backend retornar alertas reais (ex: regras/thresholds calculados a partir dos dados extraídos)."
    />
  )
}

function ConfigPage({ sistema, jobStatus, cidade, uf, anoIni, anoFim }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SurfaceCard>
        <SectionLabel>Status do projeto</SectionLabel>
        <h1 className="text-2xl font-bold text-slate-900">Contexto acadêmico do SUS Predict</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Projeto de TCC da FIAP com foco em monitoramento e previsão baseados em dados públicos do SUS.
          A interface foi redesenhada para transmitir leitura executiva sem perder o caráter demonstrativo e técnico.
        </p>

        <div className="mt-6 grid gap-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Situação atual</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{jobStatus === 'done' ? 'Análise concluída' : 'Aguardando nova extração'}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Recorte ativo</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{sistema || 'Sistema'} · {cidade || 'Município'}, {uf || 'UF'} · {anoIni}–{anoFim}</p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <SectionLabel>Stack</SectionLabel>
        <div className="space-y-4 text-sm text-slate-600">
          <p><strong className="text-slate-900">Backend:</strong> Python, FastAPI e PySUS.</p>
          <p><strong className="text-slate-900">Frontend:</strong> React, Tailwind e Recharts.</p>
          <p><strong className="text-slate-900">Restrições:</strong> Python 3.12 para PySUS e latência variável no FTP do DATASUS.</p>
          <p><strong className="text-slate-900">Objetivo:</strong> reduzir o tempo até a decisão visual em menos de 30 segundos.</p>
        </div>
      </SurfaceCard>
    </div>
  )
}

export default function App() {
  const [activeView, setActiveView] = useState('overview')

  const [step, setStep] = useState(1)
  const [sistema, setSistema] = useState('')
  // Foco atual do projeto: São Paulo/SP (município 355030)
  const [uf, setUf] = useState('SP')
  const [cidade, setCidade] = useState('São Paulo')
  const [ibge, setIbge] = useState('3550308')
  const [anoIni, setAnoIni] = useState(2019)
  const [anoFim, setAnoFim] = useState(2024)
  const [doenca, setDoenca] = useState('')

  const [estados, setEstados] = useState([])
  const [cidades, setCidades] = useState([])
  const [doencas, setDoencas] = useState([])
  const [anoLimites, setAnoLimites] = useState({})

  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState('idle')
  const [progresso, setProgresso] = useState(0)
  const [mensagem, setMensagem] = useState('')
  const [resultado, setResultado] = useState(null)

  const [startingJob, setStartingJob] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const [backendError, setBackendError] = useState(null)
  const [supabaseRuns, setSupabaseRuns] = useState([])
  const [bootstrapTried, setBootstrapTried] = useState(false)

  useEffect(() => {
    const fetchJson = async (url) => {
      const response = await fetch(url)
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const message = (data && (data.detail || data.message)) ? (data.detail || data.message) : `HTTP ${response.status}`
        throw new Error(message)
      }
      return data
    }

    ;(async () => {
      try {
        const lista = await fetchJson(`${API}/api/estados`)
        setEstados(Array.isArray(lista) ? lista : [])
      } catch (e) {
        setBackendError(String(e?.message ?? e) || 'Não foi possível conectar ao backend. Verifique se o servidor FastAPI está rodando na porta 8000.')
      }
    })()

    ;(async () => {
      try {
        const limites = await fetchJson(`${API}/api/ano_limite`)
        setAnoLimites(limites || {})
      } catch {
        // silencioso: o frontend tem fallback seguro de ano máximo
      }
    })()
  }, [])

  useEffect(() => {
    if (sistema === 'SINAN' && doencas.length === 0) {
      fetch(`${API}/api/doencas`)
        .then(async (response) => {
          const data = await response.json().catch(() => null)
          if (!response.ok) return []
          return Array.isArray(data) ? data : []
        })
        .then(setDoencas)
        .catch(() => setDoencas([]))
    }
  }, [sistema, doencas.length])

  useEffect(() => {
    if (!jobId || jobStatus === 'done' || jobStatus === 'error') return

    const intervalId = setInterval(async () => {
      try {
        const statusResponse = await fetch(`${API}/api/status/${jobId}`)
        const statusData = await statusResponse.json()
        setProgresso(statusData.progresso)
        setMensagem(statusData.mensagem)

        if (statusData.status === 'done') {
          setJobStatus('done')
          const resultResponse = await fetch(`${API}/api/resultado/${jobId}`)
          setResultado(await resultResponse.json())
          setActiveView('overview')
        } else if (statusData.status === 'error') {
          setJobStatus('error')
          setMensagem(statusData.mensagem)
        }
      } catch {
        clearInterval(intervalId)
      }
    }, 800)

    return () => clearInterval(intervalId)
  }, [jobId, jobStatus])

  const analytics = toRealAnalytics(resultado, sistema, cidade, uf, anoIni, anoFim)
  const notificationCount = 0

  const loadCidades = async (sigla) => {
    try {
      const response = await fetch(`${API}/api/cidades/${sigla}`)
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error((data && data.detail) ? data.detail : `HTTP ${response.status}`)
      setCidades(Array.isArray(data) ? data : [])
    } catch (e) {
      setCidades([])
      setBackendError(String(e?.message ?? e))
    }
  }

  const handleConfirm = async () => {
    setStartingJob(true)
    try {
      const response = await fetch(`${API}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sistema,
          uf,
          cidade,
          ibge,
          ano_ini: anoIni,
          ano_fim: anoFim,
          doenca_cod: sistema === 'SINAN' ? doenca : '',
        }),
      })
      const data = await response.json()
      setJobId(data.job_id)
      setJobStatus('running')
      setResultado(null)
      setActiveView('overview')
    } catch {
      window.alert('Erro ao iniciar o job. Verifique se o backend está rodando.')
    }
    setStartingJob(false)
  }

  const handleCleanup = async () => {
    if (!jobId) return

    setCleaningUp(true)
    try {
      await fetch(`${API}/api/cleanup/${jobId}`, { method: 'DELETE' })
      setStep(1)
      setSistema('')
      setUf('')
      setCidade('')
      setIbge('')
      setAnoIni(2019)
      setAnoFim(2024)
      setDoenca('')
      setJobId(null)
      setJobStatus('idle')
      setResultado(null)
      setProgresso(0)
      setMensagem('')
      setActiveView('overview')
    } catch {}
    setCleaningUp(false)
  }

  const handleExportXlsx = async () => {
    if (!jobId) return
    setExportingXlsx(true)
    try {
      const response = await fetch(`${API}/api/export/${jobId}`)
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `Falha ao exportar (HTTP ${response.status})`)
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sus_predict_${jobId}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      window.alert(`Não foi possível exportar XLSX.\n\n${String(e?.message ?? e)}`)
    }
    setExportingXlsx(false)
  }

  const loadFromCacheRun = async (run) => {
    if (!run?.sistema) return false
    setSistema(run.sistema)
    setUf(run.uf || 'SP')
    setCidade(run.cidade || 'São Paulo')
    setIbge(run.ibge6 ? `${run.ibge6}00` : (ibge || ''))
    setAnoIni(Number(run.ano_ini || anoIni))
    setAnoFim(Number(run.ano_fim || anoFim))
    setDoenca(run.doenca_cod || '')

    setStartingJob(true)
    try {
      const response = await fetch(`${API}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sistema: run.sistema,
          uf: run.uf || uf,
          cidade: run.cidade || cidade,
          ibge: run.ibge6 ? `${run.ibge6}00` : ibge,
          ano_ini: Number(run.ano_ini || anoIni),
          ano_fim: Number(run.ano_fim || anoFim),
          doenca_cod: run.doenca_cod || '',
          usar_cache: true,
        }),
      })
      const data = await response.json()
      setJobId(data.job_id)
      if (data.cache) {
        setJobStatus('done')
        const r2 = await fetch(`${API}/api/resultado/${data.job_id}`)
        setResultado(await r2.json())
      } else {
        setJobStatus('running')
      }
      setActiveView('overview')
      return true
    } catch {
      return false
    } finally {
      setStartingJob(false)
    }
  }

  // Bootstrap: ao entrar no app, tenta carregar o run mais recente do Supabase.
  useEffect(() => {
    if (backendError) return
    if (bootstrapTried) return
    if (jobStatus === 'running') return
    if (resultado) return

    let mounted = true
    const bootstrap = async () => {
      try {
        const r = await fetch(`${API}/api/runs?limit=200`)
        const d = await r.json().catch(() => null)
        const list = d?.runs && Array.isArray(d.runs) ? d.runs : []
        if (!mounted) return
        setSupabaseRuns(list)
        if (list.length > 0) {
          await loadFromCacheRun(list[0])
        }
      } catch {
        if (!mounted) return
        setSupabaseRuns([])
      } finally {
        if (mounted) setBootstrapTried(true)
      }
    }
    bootstrap()
    return () => { mounted = false }
  }, [backendError, bootstrapTried, jobStatus, resultado])

  const handleChangeCategory = async (nextSistema) => {
    if (!nextSistema) return
    // Preferência: se já existe run no Supabase para a categoria, carrega ele.
    const match = supabaseRuns.find((r) => r.sistema === nextSistema)
    if (match) {
      const ok = await loadFromCacheRun(match)
      if (!ok) window.alert('Não foi possível carregar do Supabase. Verifique o backend e tente novamente.')
      return
    }

    // Fallback: abre a aba de download para gerar dados reais dessa categoria.
    setSistema(nextSistema)
    setActiveView('download')
  }

  const topbar = (
    <>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{NAV_ITEMS.find((item) => item.key === activeView)?.label ?? 'SUS Predict'}</p>
        <h2 className="text-lg font-bold text-slate-900">
          {activeView === 'overview' ? 'Visão Geral' : NAV_ITEMS.find((item) => item.key === activeView)?.label}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sistema || ''}
          onChange={(e) => handleChangeCategory(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        >
          <option value="" disabled>Categoria</option>
          {Object.keys(SISTEMA_META).map((cod) => (
            <option key={cod} value={cod}>{cod} — {SISTEMA_META[cod].label}</option>
          ))}
        </select>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {cidade && uf ? `${cidade} — ${uf}` : 'Selecione um município'}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {anoIni}–{anoFim}
        </div>
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg">
          🔔
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {notificationCount}
          </span>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">US</div>
      </div>
    </>
  )

  let content = null

  if (backendError) {
    content = <ErrorState message={backendError} onRetry={() => { setBackendError(null); window.location.reload() }} />
  } else if (jobStatus === 'running') {
    content = <LoadingState sistema={sistema} cidade={cidade} uf={uf} progresso={progresso} mensagem={mensagem} />
  } else if (jobStatus === 'error') {
    content = (
      <SurfaceCard className="mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-3xl">❌</div>
        <h1 className="text-2xl font-bold text-slate-900">Erro no processamento</h1>
        <p className="mt-2 text-sm text-slate-500">{mensagem}</p>
        <button onClick={() => { setJobStatus('idle'); setStep(3) }} className="mt-6 rounded-xl bg-[var(--blue-500)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--blue-600)]">
          Tentar novamente
        </button>
      </SurfaceCard>
    )
  } else if (!analytics) {
    content = (
      <ExtractionWorkspace
        step={step}
        sistema={sistema}
        setSistema={setSistema}
        estados={estados}
        cidades={cidades}
        uf={uf}
        setUf={setUf}
        cidade={cidade}
        setCidade={setCidade}
        ibge={ibge}
        setIbge={setIbge}
        anoIni={anoIni}
        setAnoIni={setAnoIni}
        anoFim={anoFim}
        setAnoFim={setAnoFim}
        anoLimites={anoLimites}
        doencas={doencas}
        doenca={doenca}
        setDoenca={setDoenca}
        onLoadCidades={loadCidades}
        onNext={() => setStep((value) => Math.min(value + 1, 3))}
        onBack={() => setStep((value) => Math.max(value - 1, 1))}
        onConfirm={handleConfirm}
        loading={startingJob}
      />
    )
  } else if (activeView === 'overview') {
    content = (
      <OverviewPage
        analytics={analytics}
        onCleanup={handleCleanup}
        onExportXlsx={handleExportXlsx}
        exportingXlsx={exportingXlsx}
        cleaningUp={cleaningUp}
        jobId={jobId}
      />
    )
  } else if (activeView === 'download') {
    content = (
      <ExtractionWorkspace
        step={step}
        sistema={sistema}
        setSistema={setSistema}
        estados={estados}
        cidades={cidades}
        uf={uf}
        setUf={setUf}
        cidade={cidade}
        setCidade={setCidade}
        ibge={ibge}
        setIbge={setIbge}
        anoIni={anoIni}
        setAnoIni={setAnoIni}
        anoFim={anoFim}
        setAnoFim={setAnoFim}
        anoLimites={anoLimites}
        doencas={doencas}
        doenca={doenca}
        setDoenca={setDoenca}
        onLoadCidades={loadCidades}
        onNext={() => setStep((value) => Math.min(value + 1, 3))}
        onBack={() => setStep((value) => Math.max(value - 1, 1))}
        onConfirm={handleConfirm}
        loading={startingJob}
      />
    )
  } else if (activeView === 'mapa') {
    content = <MapPage analytics={analytics} />
  } else if (activeView === 'superlotacao') {
    content = <SuperlotacaoPage analytics={analytics} />
  } else if (activeView === 'alertas') {
    content = <AlertasPage analytics={analytics} />
  } else if (activeView === 'config') {
    content = <ConfigPage sistema={sistema} jobStatus={jobStatus} cidade={cidade} uf={uf} anoIni={anoIni} anoFim={anoFim} />
  } else {
    content = (
      <EmptyModule
        title={NAV_ITEMS.find((item) => item.key === activeView)?.label ?? 'Módulo'}
        description="Sem dados fictícios: este módulo só será mostrado quando o backend expuser métricas reais para ele."
      />
    )
  }

  return (
    <AppShell activeView={activeView} onChangeView={setActiveView} topbar={topbar}>
      {content}
    </AppShell>
  )
}
