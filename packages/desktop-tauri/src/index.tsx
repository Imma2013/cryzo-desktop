import { For, Show, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { invoke } from "@tauri-apps/api/core"
import { copy } from "./copy"
import "./style.css"

type Session = { id: string; directory: string; title: string; status: string }
type NativeEvent = { sequence: number; session_id: string; kind: string; data: unknown }
type Api = { protocol: string; base_url: string | null }
type Model = { id: string; name: string; apis: Api[] }
type Provider = { id: string; name: string; models: Model[] }
type Bootstrap = { sessions: Session[]; catalog: { providers: Provider[] } }
type Operation = { tool: "list"; path: string } | { tool: "diff" } | { tool: "shell"; program: string; args: string[] }
type Approval = { approval_required: string; operation: Operation }

function App() {
  const [state, set] = createStore({
    ready: false,
    sessions: [] as Session[],
    providers: [] as Provider[],
    selected: "",
    provider: "openrouter",
    model: "",
    prompt: "",
    promptID: crypto.randomUUID(),
    events: [] as NativeEvent[],
    error: "",
    notice: "",
    busy: false,
    program: "git",
    args: '["status", "--short"]',
    approval: undefined as Approval | undefined,
  })
  const models = () => state.providers.find((provider) => provider.id === state.provider)?.models.filter((model) => model.apis.some((api) => api.protocol === "chat-completions" && api.base_url)) ?? []
  const selected = () => state.sessions.find((session) => session.id === state.selected)
  let secret!: HTMLInputElement
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false

  async function refresh() {
    const current = state.selected
    if (!state.ready) {
      const bootstrap = await invoke<Bootstrap>("bootstrap")
      set("sessions", bootstrap.sessions)
      set("providers", bootstrap.catalog.providers)
      set("selected", bootstrap.sessions[0]?.id ?? "")
      set("model", models()[0]?.id ?? "")
      set("ready", true)
    }
    if (state.ready) set("sessions", await invoke<Session[]>("list_sessions"))
    if (current) {
      const after = state.events.at(-1)?.sequence ?? 0
      const events = await invoke<NativeEvent[]>("events", { session: current, after })
      if (state.selected === current) set("events", (previous) => [...new Map([...previous, ...events].map((event) => [event.sequence, event])).values()].sort((a, b) => a.sequence - b.sequence))
    }
  }

  async function poll() {
    if (closed) return
    await refresh().catch((error: unknown) => set("error", String(error)))
    if (!closed) timer = setTimeout(() => void poll(), 750)
  }

  async function action(run: () => Promise<void>) {
    set({ error: "", notice: "", busy: true })
    await run().catch((error: unknown) => set("error", String(error)))
    set("busy", false)
  }

  async function open() {
    const directory = await invoke<string | null>("choose_directory")
    if (!directory) return
    const session = await invoke<Session>("create_session", { directory, title: copy.title })
    set({ selected: session.id, events: [], approval: undefined })
    await refresh()
  }

  async function tool(operation: Operation, approval?: string) {
    const result = await invoke<unknown>("tool", { session: state.selected, operation, approval: approval ?? null })
    if (typeof result === "object" && result && "approval_required" in result && "operation" in result) {
      set("approval", result as Approval)
    }
    await refresh()
  }

  async function decision(allow: boolean) {
    const approval = state.approval
    if (!approval) return
    await invoke("decide", { session: state.selected, approval: approval.approval_required, allow })
    set("approval", undefined)
    if (allow) await tool(approval.operation, approval.approval_required)
  }

  onMount(() => void poll())
  onCleanup(() => { closed = true; clearTimeout(timer) })

  return <div class="app">
    <header><strong>{copy.brand}<span>{copy.native}</span></strong><span class="badge">0.1.0 · Rust / Tauri 2</span></header>
    <div class="layout">
      <aside>
        <button class="primary" disabled={state.busy} onClick={() => void action(open)}>{copy.open}</button>
        <h2>{copy.sessions}</h2>
        <For each={state.sessions}>{(session) => <button class="session" aria-current={state.selected === session.id ? "page" : undefined} onClick={() => set({ selected: session.id, events: [], approval: undefined })}>
          <strong>{session.title}</strong><span>{session.directory}</span><small>{session.status}</small>
        </button>}</For>
      </aside>
      <main data-scrollable>
        <div class="intro"><h1>{copy.heading}</h1><p>{copy.intro}</p></div>
        <Show when={state.ready} fallback={<p role="status">{copy.loading}</p>}>
          <section class="settings">
            <label>{copy.provider}<select value={state.provider} onChange={(event) => { set("provider", event.currentTarget.value); set("model", models()[0]?.id ?? "") }}><For each={state.providers}>{(provider) => <option value={provider.id}>{provider.name}</option>}</For></select></label>
            <label>{copy.model}<select value={state.model} onChange={(event) => set("model", event.currentTarget.value)}><For each={models()}>{(model) => <option value={model.id}>{model.name}</option>}</For></select></label>
            <form class="credential" onSubmit={(event) => { event.preventDefault(); void action(async () => { await invoke("save_credential", { provider: state.provider, secret: secret.value }); secret.value = ""; set("notice", copy.saved) }) }}>
              <label>{copy.credential}<input ref={secret} type="password" autocomplete="off" required /></label><button disabled={state.busy}>{copy.save}</button>
            </form><p class="muted">{copy.transport}</p>
          </section>
          <Show when={selected()} fallback={<p class="empty">{copy.empty}</p>}>
            <section>
              <form onSubmit={(event) => { event.preventDefault(); void action(async () => { await invoke("prompt", { session: state.selected, provider: state.provider, model: state.model, id: state.promptID, text: state.prompt }); set({ prompt: "", promptID: crypto.randomUUID() }); await refresh() }) }}>
                <label>{copy.prompt}<textarea value={state.prompt} placeholder={copy.promptHint} required onInput={(event) => set({ prompt: event.currentTarget.value, promptID: crypto.randomUUID() })} /></label>
                <div class="actions"><button class="primary" disabled={state.busy || !state.model || selected()?.status === "running"}>{copy.send}</button><button type="button" onClick={() => void action(async () => { await invoke("cancel", { session: state.selected }) })}>{copy.cancel}</button></div>
              </form>
            </section>
            <section><div class="actions"><button onClick={() => void action(() => tool({ tool: "list", path: "." }))}>{copy.inspect}</button><button onClick={() => void action(() => tool({ tool: "diff" }))}>{copy.diff}</button></div>
              <h2>{copy.terminal}</h2><form class="command" onSubmit={(event) => { event.preventDefault(); void action(async () => { const args: unknown = JSON.parse(state.args); if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) throw new Error(copy.args); await tool({ tool: "shell", program: state.program, args }) }) }}>
                <label>{copy.program}<input value={state.program} required onInput={(event) => set("program", event.currentTarget.value)} /></label><label>{copy.args}<input value={state.args} required onInput={(event) => set("args", event.currentTarget.value)} /></label><button disabled={state.busy}>{copy.run}</button>
              </form>
            </section>
            <Show when={state.approval}>{(approval) => <section class="approval"><h2>{copy.approval}</h2><pre>{JSON.stringify(approval().operation, null, 2)}</pre><div class="actions"><button class="primary" onClick={() => void action(() => decision(true))}>{copy.approve}</button><button onClick={() => void action(() => decision(false))}>{copy.deny}</button></div></section>}</Show>
            <section><h2>{copy.events}</h2><div class="events" data-scrollable><For each={state.events}>{(event) => <article><small>{event.sequence} · {event.kind}</small><pre>{JSON.stringify(event.data, null, 2)}</pre></article>}</For></div></section>
          </Show>
        </Show>
        <Show when={state.error}><p class="error" role="alert"><strong>{copy.error}</strong> · {state.error}</p></Show>
        <Show when={state.notice}><p role="status">{state.notice}</p></Show>
      </main>
    </div>
  </div>
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing desktop root")
render(() => <App />, root)
