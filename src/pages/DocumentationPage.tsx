import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

interface CodeBlockProps {
  code: string
}

function CodeBlock({ code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="overflow-hidden rounded-lg bg-slate-900">
      <div className="flex justify-end border-b border-white/10 px-2 py-1">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10"
        >
          {copied ? 'Copiado ✓' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function BaseUrlBanner() {
  const [copied, setCopied] = useState(false)
  const baseUrl = `${SUPABASE_URL}/functions/v1`

  async function handleCopy() {
    await navigator.clipboard.writeText(baseUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary-light p-5 shadow-card">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">URL base de la API</h2>
      <p className="mb-3 text-xs text-slate-600">
        Esta es la URL para conectar sistemas externos — <strong>no</strong> es la URL de esta
        aplicación web (esa es donde tú abres tableros en el navegador; la API vive en otro lugar,
        aquí abajo).
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={baseUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-white px-3 py-1.5 font-mono text-sm text-slate-800"
        />
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="cursor-pointer whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
        >
          {copied ? 'Copiado ✓' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="rounded-xl border border-border-subtle bg-surface p-5 shadow-card">
      <h2 className="mb-3 text-base font-bold text-slate-900">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  )
}

const TOC = [
  { id: 'generar-clave', label: '1. Generar una clave API' },
  { id: 'autenticacion', label: '2. Autenticación' },
  { id: 'leer-datos', label: '3. Leer datos del tablero (GET)' },
  { id: 'escribir-datos', label: '4. Escribir en un tablero (POST/PATCH)' },
  { id: 'webhooks', label: '5. Webhooks' },
  { id: 'ejemplos', label: '6. Ejemplos' },
]

export default function DocumentationPage() {
  return (
    <div className="min-h-screen bg-app-bg">
      <header className="flex items-center justify-between border-b border-border-subtle bg-surface px-6 py-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800">
            ← Tableros
          </Link>
          <h1 className="text-lg font-bold text-slate-900">Documentación de la API</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-8">
        <BaseUrlBanner />

        <div className="rounded-xl border border-border-subtle bg-surface p-5 shadow-card">
          <p className="text-sm leading-relaxed text-slate-600">
            Cada tablero puede generar una o más claves API para que un sistema externo lea sus
            listas y tarjetas por REST, escriba cambios de vuelta por el mismo camino, y reciba un
            webhook cuando algo cambia. Todo lo de abajo está limitado al tablero: una clave solo
            ve el tablero para el que fue generada.
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {TOC.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-primary transition-colors hover:text-primary-hover">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <Section id="generar-clave" title="1. Generar una clave API">
          <p>
            Abre un tablero, entra a <strong>Integraciones</strong> en el encabezado del tablero, y
            usa <strong>Generar nueva clave API</strong> bajo "Claves API". Esa clave (formato{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">tk_…</code>) se
            muestra <strong>una sola vez</strong> — cópiala antes de cerrar el panel, no hay forma
            de volver a verla después (solo se guarda su hash). Si la pierdes, revócala y genera
            una nueva.
          </p>
          <p>Solo el propietario del tablero puede generar o revocar sus claves. También puede hacerse por código:</p>
          <CodeBlock
            code={`await supabase.rpc('generate_api_key', { p_board_id: '<board id>', p_label: 'zapier' })
// -> { id, api_key, key_prefix, label, created_at }`}
          />
        </Section>

        <Section id="autenticacion" title="2. Autenticación">
          <p>Cada solicitud a los dos endpoints REST (sección 3 y 4) necesita este encabezado:</p>
          <CodeBlock code="Authorization: Bearer tk_..." />
          <p>Una clave incorrecta, revocada o expirada responde con un 401 genérico:</p>
          <CodeBlock code={'{ "error": "invalid or expired API key" }'} />
          <p className="text-xs text-slate-400">
            (un encabezado ausente o mal formado da un mensaje distinto describiendo el formato
            esperado, pero el principio es el mismo: la API nunca dice qué parte de la
            autenticación falló.)
          </p>
        </Section>

        <Section id="leer-datos" title="3. Leer datos del tablero — GET">
          <CodeBlock code={`GET ${SUPABASE_URL}/functions/v1/api-board-data?type=cards`} />
          <p>
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">type</code> es
            opcional: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">boards</code>,{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">lists</code>, o{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">cards</code>.
            Si se omite, devuelve los tres.
          </p>
          <CodeBlock
            code={`{
  "board": { "id": "...", "name": "...", "background_color": "...", "background_image_path": null, "created_at": "...", "updated_at": "..." },
  "lists": [{ "id": "...", "board_id": "...", "name": "...", "position": 1, "created_at": "..." }],
  "cards": [{ "id": "...", "list_id": "...", "title": "...", "description": null, "position": 1, "start_date": null, "end_date": null, "complete": false, "location_data": null, "cover_attachment_id": null, "created_at": "...", "updated_at": "..." }]
}`}
          />
          <p className="text-xs text-slate-400">
            Una solicitud que no sea GET responde 405; un <code>type</code> no reconocido responde 400.
          </p>
        </Section>

        <Section id="escribir-datos" title="4. Escribir en un tablero — POST/PATCH">
          <p>
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">POST</code> y{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">PATCH</code> se
            comportan igual — la acción se elige con el campo{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">action</code> del
            cuerpo JSON. Cuatro acciones disponibles:
          </p>

          <div>
            <p className="font-semibold text-slate-700">create_card</p>
            <p className="text-xs text-slate-500">
              requiere <code>list_id</code>, <code>title</code>; opcional <code>description</code>.
            </p>
            <CodeBlock
              code={`{ "action": "create_card", "list_id": "<list id>", "title": "Ping the vendor", "description": "optional" }
→ 201 { "card": { "id": "...", "list_id": "...", "title": "Ping the vendor", "position": 4, ... } }`}
            />
          </div>

          <div>
            <p className="font-semibold text-slate-700">update_card</p>
            <p className="text-xs text-slate-500">
              requiere <code>card_id</code>; al menos uno de <code>title</code>,{' '}
              <code>description</code>, <code>complete</code>, <code>start_date</code>,{' '}
              <code>end_date</code>.
            </p>
            <CodeBlock
              code={`{ "action": "update_card", "card_id": "<card id>", "complete": true }
→ 200 { "card": { ...updated row... } }`}
            />
          </div>

          <div>
            <p className="font-semibold text-slate-700">create_list</p>
            <p className="text-xs text-slate-500">
              requiere <code>title</code>; opcional <code>position</code> (por defecto, al final del
              tablero).
            </p>
            <CodeBlock
              code={`{ "action": "create_list", "title": "Backlog" }
→ 201 { "list": { "id": "...", "board_id": "...", "name": "Backlog", "position": 4, ... } }`}
            />
          </div>

          <div>
            <p className="font-semibold text-slate-700">update_list</p>
            <p className="text-xs text-slate-500">
              requiere <code>list_id</code>; al menos uno de <code>title</code>, <code>position</code>.
            </p>
            <CodeBlock
              code={`{ "action": "update_list", "list_id": "<list id>", "position": 2 }
→ 200 { "list": { ...updated row... } }`}
            />
          </div>

          <p className="text-xs text-slate-400">
            Subir archivos adjuntos todavía no está soportado por esta API. Una acción desconocida o
            un campo requerido faltante responde 400; un <code>list_id</code>/<code>card_id</code>{' '}
            que existe pero pertenece a otro tablero responde 403; uno que no existe responde 404.
          </p>
        </Section>

        <Section id="webhooks" title="5. Webhooks">
          <p>
            En el mismo panel de <strong>Integraciones</strong>, bajo "Webhooks", ingresa una URL de
            destino y haz clic en <strong>Registrar</strong> — debe ser{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">https://</code>, no
            se acepta <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">http://</code>.
          </p>
          <p>
            Un webhook se dispara en cada creación, edición o borrado de una tarjeta o lista en un
            tablero con al menos un endpoint activo. El cuerpo enviado a tu URL:
          </p>
          <CodeBlock
            code={`{
  "record": { "...": "la fila completa de la tarjeta o lista (la fila anterior, en un borrado)" },
  "board_id": "...",
  "user_id": "...",
  "username": "..."
}`}
          />
          <p>
            La entrega no es automática ni en tiempo real — la función que vacía la cola solo
            corre cuando algo la invoca (el botón <strong>Probar entrega de webhooks</strong> del
            panel, o un programador/cron externo apuntando directo a la URL). Ese cron externo
            necesita autenticarse con un secreto compartido:
          </p>
          <CodeBlock
            code={`curl -X POST -H "Authorization: Bearer <WEBHOOK_DELIVERY_SECRET>" \\
  "${SUPABASE_URL}/functions/v1/webhook-delivery"`}
          />
          <p className="text-xs text-slate-400">
            Cada intento de entrega tiene un timeout de 10s y no sigue redirecciones. Un evento en
            cola se reintenta hasta 3 veces antes de marcarse como fallido.
          </p>
        </Section>

        <Section id="ejemplos" title="6. Ejemplos">
          <p>Leer las tarjetas de un tablero:</p>
          <CodeBlock
            code={`curl -H "Authorization: Bearer tk_..." \\
  "${SUPABASE_URL}/functions/v1/api-board-data?type=cards"`}
          />
          <p>Crear una tarjeta:</p>
          <CodeBlock
            code={`curl -X POST -H "Authorization: Bearer tk_..." -H "Content-Type: application/json" \\
  -d '{"action":"create_card","list_id":"<list id>","title":"New card"}' \\
  "${SUPABASE_URL}/functions/v1/api-board-mutation"`}
          />
          <p className="text-xs text-slate-400">
            Para ver un webhook real sin escribir un receptor propio, registra una URL de
            inspección desechable (por ejemplo{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
              https://webhook.site/&lt;tu id&gt;
            </code>
            ) como endpoint y dispara la entrega desde el panel.
          </p>
        </Section>
      </main>
    </div>
  )
}
