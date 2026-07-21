import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { ApiKey, Board, WebhookEndpoint } from '../types'

interface IntegrationsPanelProps {
  board: Board
  isOwner: boolean
  onClose: () => void
}

interface GeneratedApiKey {
  id: string
  api_key: string
  key_prefix: string
  label: string
  created_at: string
}

interface WebhookTestResult {
  processed: number
  delivered: number
  failed: number
  retried: number
}

// The API lives here, at the Supabase project's own URL -- NOT at this
// webapp's own URL (the one in the browser's address bar). Shown explicitly
// in the panel since that distinction has been a real source of confusion.
const API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1`

function apiKeyStatus(key: ApiKey): 'Activa' | 'Revocada' | 'Expirada' {
  if (key.revoked_at) return 'Revocada'
  if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) return 'Expirada'
  return 'Activa'
}

export function IntegrationsPanel({ board, isOwner, onClose }: IntegrationsPanelProps) {
  const [baseUrlCopied, setBaseUrlCopied] = useState(false)

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loadingKeys, setLoadingKeys] = useState(true)
  const [keysError, setKeysError] = useState<string | null>(null)
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [generatingKey, setGeneratingKey] = useState(false)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)
  const [generatedKey, setGeneratedKey] = useState<GeneratedApiKey | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)

  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([])
  const [loadingWebhooks, setLoadingWebhooks] = useState(true)
  const [webhooksError, setWebhooksError] = useState<string | null>(null)
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  const [registeringWebhook, setRegisteringWebhook] = useState(false)
  const [togglingWebhookId, setTogglingWebhookId] = useState<string | null>(null)

  const [testingWebhooks, setTestingWebhooks] = useState(false)
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadKeys() {
      setLoadingKeys(true)
      const { data, error: fetchError } = await supabase
        .from('api_keys')
        .select('id, board_id, key_prefix, label, created_at, expires_at, revoked_at')
        .eq('board_id', board.id)
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (fetchError) {
        setKeysError(fetchError.message)
      } else {
        setApiKeys((data ?? []) as ApiKey[])
      }
      setLoadingKeys(false)
    }

    async function loadWebhooks() {
      setLoadingWebhooks(true)
      const { data, error: fetchError } = await supabase
        .from('webhook_endpoints')
        .select('id, board_id, target_url, active, created_at')
        .eq('board_id', board.id)
        .order('created_at', { ascending: false })

      if (cancelled) return
      if (fetchError) {
        setWebhooksError(fetchError.message)
      } else {
        setWebhooks((data ?? []) as WebhookEndpoint[])
      }
      setLoadingWebhooks(false)
    }

    void loadKeys()
    void loadWebhooks()
    return () => {
      cancelled = true
    }
  }, [board.id])

  async function handleGenerateKey(e: FormEvent) {
    e.preventDefault()
    const label = newKeyLabel.trim()
    if (!label) return
    setGeneratingKey(true)
    setKeysError(null)

    const { data, error: rpcError } = await supabase
      .rpc('generate_api_key', { p_board_id: board.id, p_label: label })
      .single()

    setGeneratingKey(false)
    if (rpcError || !data) {
      setKeysError(rpcError?.message ?? 'No se pudo generar la clave API.')
      return
    }

    const created = data as GeneratedApiKey
    setGeneratedKey(created)
    setKeyCopied(false)
    setApiKeys((prev) => [
      {
        id: created.id,
        board_id: board.id,
        key_prefix: created.key_prefix,
        label: created.label,
        created_at: created.created_at,
        expires_at: null,
        revoked_at: null,
      },
      ...prev,
    ])
    setNewKeyLabel('')
  }

  async function handleCopyBaseUrl() {
    await navigator.clipboard.writeText(API_BASE_URL)
    setBaseUrlCopied(true)
    setTimeout(() => setBaseUrlCopied(false), 2000)
  }

  async function handleCopyKey() {
    if (!generatedKey) return
    await navigator.clipboard.writeText(generatedKey.api_key)
    setKeyCopied(true)
    setTimeout(() => setKeyCopied(false), 2000)
  }

  async function handleRevokeKey(keyId: string) {
    if (!window.confirm('¿Revocar esta clave API? Dejará de funcionar de inmediato.')) return
    setRevokingKeyId(keyId)
    setKeysError(null)
    const { error: rpcError } = await supabase.rpc('revoke_api_key', { p_key_id: keyId })
    setRevokingKeyId(null)
    if (rpcError) {
      setKeysError(rpcError.message)
      return
    }
    setApiKeys((prev) =>
      prev.map((k) => (k.id === keyId ? { ...k, revoked_at: new Date().toISOString() } : k)),
    )
  }

  async function handleRegisterWebhook(e: FormEvent) {
    e.preventDefault()
    const url = newWebhookUrl.trim()
    if (!url) return
    setRegisteringWebhook(true)
    setWebhooksError(null)

    const { data, error: rpcError } = await supabase.rpc('register_webhook_endpoint', {
      p_board_id: board.id,
      p_target_url: url,
    })

    setRegisteringWebhook(false)
    if (rpcError || !data) {
      setWebhooksError(rpcError?.message ?? 'No se pudo registrar el endpoint.')
      return
    }
    setWebhooks((prev) => [data as WebhookEndpoint, ...prev])
    setNewWebhookUrl('')
  }

  async function handleToggleWebhook(endpoint: WebhookEndpoint) {
    setTogglingWebhookId(endpoint.id)
    setWebhooksError(null)
    const { error: rpcError } = await supabase.rpc('set_webhook_endpoint_active', {
      p_endpoint_id: endpoint.id,
      p_active: !endpoint.active,
    })
    setTogglingWebhookId(null)
    if (rpcError) {
      setWebhooksError(rpcError.message)
      return
    }
    setWebhooks((prev) => prev.map((w) => (w.id === endpoint.id ? { ...w, active: !w.active } : w)))
  }

  async function handleTestDelivery() {
    setTestingWebhooks(true)
    setWebhooksError(null)
    setTestResult(null)
    const { data, error: invokeError } = await supabase.functions.invoke('webhook-delivery')
    setTestingWebhooks(false)
    if (invokeError) {
      setWebhooksError(invokeError.message)
      return
    }
    setTestResult(data as WebhookTestResult)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-lg rounded-2xl bg-surface p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Integraciones</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg px-2 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <Link to="/documentation" className="mb-3 inline-block text-xs text-primary hover:text-primary-hover">
          Ver documentación completa de la API →
        </Link>

        <div className="mb-4 rounded-lg border border-primary/30 bg-primary-light px-3 py-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
            URL base de la API (no es la URL de esta app)
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={API_BASE_URL}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-white px-2 py-1 font-mono text-xs text-slate-800"
            />
            <button
              type="button"
              onClick={() => void handleCopyBaseUrl()}
              className="cursor-pointer whitespace-nowrap rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              {baseUrlCopied ? 'Copiado ✓' : 'Copiar'}
            </button>
          </div>
        </div>

        {!isOwner && (
          <p className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
            Solo el propietario del tablero puede administrar claves API y webhooks. Aquí puedes ver el
            estado actual en modo solo lectura.
          </p>
        )}

        {/* Claves API */}
        <div className="flex flex-col gap-3 border-b border-border-subtle pb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Claves API</h3>

          {keysError && <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{keysError}</p>}

          {isOwner && (
            <form onSubmit={handleGenerateKey} className="flex flex-col gap-2">
              <label htmlFor="new-api-key-label" className="text-xs font-medium text-slate-600">
                Etiqueta de la nueva clave
              </label>
              <div className="flex gap-2">
                <input
                  id="new-api-key-label"
                  type="text"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="p. ej. integración con Zapier"
                  className="flex-1 rounded-lg border border-border-subtle px-2 py-1.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  disabled={generatingKey || !newKeyLabel.trim()}
                  className="cursor-pointer whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generatingKey ? 'Generando…' : 'Generar nueva clave API'}
                </button>
              </div>
            </form>
          )}

          {generatedKey && (
            <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary-light px-3 py-2">
              <p className="text-xs font-medium text-slate-700">
                Copia esta clave ahora: no volverás a verla completa después de cerrar este panel.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedKey.api_key}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-white px-2 py-1.5 font-mono text-sm text-slate-700"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyKey()}
                  className="cursor-pointer whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
                >
                  {keyCopied ? 'Copiado ✓' : 'Copiar'}
                </button>
              </div>
            </div>
          )}

          {loadingKeys ? (
            <p className="text-sm text-slate-500">Cargando claves…</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {apiKeys.length === 0 && <li className="text-sm text-slate-500">Aún no hay claves API.</li>}
              {apiKeys.map((key) => {
                const status = apiKeyStatus(key)
                return (
                  <li
                    key={key.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-slate-800">{key.key_prefix}…</p>
                      <p className="truncate text-xs text-slate-500">
                        {key.label} · {new Date(key.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          status === 'Activa'
                            ? 'bg-success-light text-success'
                            : 'bg-danger-light text-danger'
                        }`}
                      >
                        {status}
                      </span>
                      {isOwner && !key.revoked_at && (
                        <button
                          type="button"
                          onClick={() => void handleRevokeKey(key.id)}
                          disabled={revokingKeyId === key.id}
                          className="cursor-pointer rounded-lg px-1.5 py-1 text-xs text-danger transition-colors hover:bg-danger-light disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {revokingKeyId === key.id ? 'Revocando…' : 'Revocar'}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Webhooks */}
        <div className="flex flex-col gap-3 pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Webhooks</h3>

          {webhooksError && (
            <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{webhooksError}</p>
          )}

          {isOwner && (
            <form onSubmit={handleRegisterWebhook} className="flex flex-col gap-2">
              <label htmlFor="new-webhook-url" className="text-xs font-medium text-slate-600">
                URL del endpoint (debe empezar con https://)
              </label>
              <div className="flex gap-2">
                <input
                  id="new-webhook-url"
                  type="url"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="https://ejemplo.com/webhook"
                  className="flex-1 rounded-lg border border-border-subtle px-2 py-1.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  disabled={registeringWebhook || !newWebhookUrl.trim()}
                  className="cursor-pointer whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {registeringWebhook ? 'Registrando…' : 'Registrar'}
                </button>
              </div>
            </form>
          )}

          {loadingWebhooks ? (
            <p className="text-sm text-slate-500">Cargando webhooks…</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {webhooks.length === 0 && (
                <li className="text-sm text-slate-500">Aún no hay endpoints registrados.</li>
              )}
              {webhooks.map((endpoint) => (
                <li
                  key={endpoint.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{endpoint.target_url}</p>
                    <p className="text-xs text-slate-500">
                      Registrado: {new Date(endpoint.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        endpoint.active ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
                      }`}
                    >
                      {endpoint.active ? 'Activo' : 'Inactivo'}
                    </span>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => void handleToggleWebhook(endpoint)}
                        disabled={togglingWebhookId === endpoint.id}
                        className="cursor-pointer rounded-lg px-1.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {togglingWebhookId === endpoint.id
                          ? 'Guardando…'
                          : endpoint.active
                            ? 'Desactivar'
                            : 'Reactivar'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isOwner && (
            <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
              <button
                type="button"
                onClick={() => void handleTestDelivery()}
                disabled={testingWebhooks}
                className="cursor-pointer self-start rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testingWebhooks ? 'Probando…' : 'Probar entrega de webhooks'}
              </button>
              {testResult && (
                <p className="text-xs text-slate-500">
                  {testResult.processed} procesados, {testResult.delivered} entregados, {testResult.failed}{' '}
                  fallidos
                  {testResult.retried > 0 ? `, ${testResult.retried} reintentados` : ''}.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
