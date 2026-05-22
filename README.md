# RAGitify — Frontend

[![Angular](https://img.shields.io/badge/Angular-17-DD0031.svg)](https://angular.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

The Angular 17 client for [RAGitify](../RAG) — an enterprise Retrieval-Augmented Generation platform.
Talk to your documents, manage your knowledge libraries, run streamed conversations across multiple LLM providers, and keep everything inside a polished, accessible, theme-aware workspace.

Pair this with the Django backend in the sibling [`RAG/`](../RAG) folder. The frontend reads its API base URL from `src/environments/environment.ts` and is otherwise self-contained.

---

## What you get

### Workspace
- **Knowledge libraries** with drag-and-drop document upload, sortable / filterable document grid, multi-select for batch actions (share, move, delete).
- **Library statistics page** with ingestion health, processing pipeline status, and per-file failure diagnostics.
- **Document details** — full file view with summary, keywords, sharing controls, in-line chat, and a complete **version history panel** (restore any prior upload, with the current state automatically snapshotted first).
- **Workspace library picker** as the workspace landing page — KPI cards, library cards / table toggle, instant filter, library-create modal.
- **Prompts section** for managing saved assistant prompts and instructions.

### Chat
- **Streaming responses** over SSE with mid-stream cancellation.
- **Auto-reconnect** for transient network failures (one silent retry, before-data-only — never duplicates an LLM call).
- **Slash commands** — type `/` in the composer to surface `/web`, `/lib` shortcuts inline.
- **Inline document previews** — hover any document chip in the composer to see title, snippet, keywords, and metadata without leaving the page.
- **Per-message data grids** — when the LLM returns tabular data, it renders as a sortable, downloadable grid attached to the message.
- **Keyboard hints** — `Enter` to send, `Shift+Enter` for newline, visible on focus.
- **Conversation export** — download any thread as Markdown or JSON.
- **Thread management** — pin, rename, delete, soft-delete restore, search across titles and message content.

### Authentication
- **Email + password** with multi-step register, live password-strength meter, and a live requirements checklist (8+ chars, upper/lower/number/symbol).
- **OAuth sign-in** — Google, Microsoft, GitHub. Buttons gracefully degrade to a clear "not configured" message when the backend doesn't have provider credentials.
- **Forgot / reset password** with rate-limited request, single-use TTL'd tokens, HTML email template, and a dedicated reset page wired to a real backend endpoint.
- **Unauthenticated-only guard** on public pages — signed-in users never accidentally land on the login / reset flow.

### Polish
- **Light / dark / system theme** with a discoverable topbar toggle. `prefers-color-scheme` followed live when "System" is selected.
- **Skeleton shimmer** loading states on every list (documents, libraries, threads).
- **Global Cmd / Ctrl+K command palette** — fuzzy search across threads, documents, libraries, assistants, plus quick actions (new chat, open workspace, toggle theme, log out).
- **Toast notifications** with `success` / `info` / `warning` / `error` variants. Non-blocking; replaces ~10 confirmation modals.
- **Top progress bar** driven by the global loading service — a thin YouTube-style accent stripe across every page.
- **Tooltips on collapsed sidebar** via a global `data-tooltip` attribute system.
- **aria-labels** on every icon-only button, **skip-to-content** link, **focus return** to the trigger after modals close, **reduced-motion** support throughout.
- **Virtual scroll** on the thread sidebar (CDK-backed, threshold-gated at >50 threads).

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Angular 17 | Mature, opinionated, batteries-included |
| Language | TypeScript 5 | Stricter contracts than JS, plays well with DRF response shapes |
| State | RxJS + service-as-store | No third-party state lib — services own their slice, components subscribe |
| HTTP | `HttpClient` + interceptors | Auth header injection, global error toaster, retry, loading indicator |
| UI primitives | Hand-rolled + `@angular/cdk` | Virtual scroll, focus management, no design-system lock-in |
| Markdown | `marked` (lazy-loaded) | Renders assistant responses with syntax-highlighted code blocks |
| Streaming | `fetch` + `ReadableStream` | SSE without an extra library |
| Icons | Font Awesome 6 | Lazy-loaded via preload trick so first paint isn't gated on the icon font |
| Notifications | `sweetalert2` + custom toast | Modal confirms via Swal (theme-aware customClass), non-blocking notifications via in-app toasts |
| Build | Angular CLI | Lazy modules, AOT, tree-shaking |

---

## Project layout

```
src/
├── app/
│   ├── auth/                       # Login, register, forgot/reset password,
│   │                               # OAuth callback, guards
│   ├── home/                       # Chat surface
│   │   ├── components/
│   │   │   ├── chat-input/         # Composer with slash menu + keyboard hints
│   │   │   ├── chat-container/     # Streaming message list
│   │   │   ├── message-bubble/     # Markdown + code + data-grid renderer
│   │   │   ├── thread-sidebar/     # Virtual-scrolled thread list
│   │   │   ├── playground/         # Incognito chat (no thread persistence)
│   │   │   ├── empty-state/        # First-run / no-thread UI
│   │   │   └── home/               # Layout shell
│   │   └── home.module.ts
│   ├── workspace/                  # Library / document management
│   │   ├── components/
│   │   │   ├── workspace-library-picker/   # Landing page (KPIs + library list)
│   │   │   ├── knowledge-section/          # Documents grid + filters + actions
│   │   │   ├── library-stats-page/         # Per-library analytics (standalone, lazy-deferable)
│   │   │   ├── document-details-page/      # File view + version history + share
│   │   │   ├── library-chat/               # Standalone chat against a whole library
│   │   │   ├── document-chat/              # Standalone chat against one document
│   │   │   ├── document-upload/            # Multi-file upload with progress
│   │   │   └── …
│   │   └── workspace.module.ts
│   ├── settings/                   # User profile, models, theme, skills, account
│   ├── setup/                      # First-run LLM setup wizard
│   ├── shared/
│   │   ├── components/             # toast, skeleton, command-palette, top-progress,
│   │   │                           # confirm-dialog, theme-toggle, message-bubble,
│   │   │                           # message-sources, thread-search-popup, …
│   │   ├── directives/             # doc-preview hover popover, etc.
│   │   ├── services/               # api, auth, oauth, conversation, response,
│   │   │                           # document, vector-store, theme, command-palette,
│   │   │                           # toast, loading, conversation-export, …
│   │   ├── interceptors/           # auth, loading, api-error-alert, retry
│   │   ├── models/                 # TypeScript interfaces for every API shape
│   │   ├── pipes/                  # format-time
│   │   └── shared.module.ts
│   ├── app.component.{ts,html}     # Skip-link, top-progress, router-outlet,
│   │                               # toast container, command palette
│   └── app.module.ts
├── environments/                   # apiUrl + feature flags
├── assets/                         # logo, images, fonts
└── styles.scss                     # Global tokens, themes, tooltip system,
                                    # focus rings, scrollbar styling, SweetAlert
                                    # theming, layout breakpoints
```

---

## Getting started

### Prerequisites

- Node.js 18+ (Node 20 LTS recommended for Angular 17)
- npm 9+
- A running RAGitify backend (see [`../RAG/README.md`](../RAG/README.md))

### Install

```bash
npm install
```

### Configure

`src/environments/environment.ts` (and `environment.prod.ts` for production builds):

```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/rag'   // backend base URL — no trailing slash
};
```

Optionally set per-environment feature flags here.

### Run

```bash
npm start
# Browser opens http://localhost:4200
```

### Build for production

```bash
npm run build
# Output in dist/ — ready to drop behind any static host (S3 + CloudFront,
# Netlify, nginx, etc.) with a SPA-fallback rule for client-side routing.
```

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/⌘ + K` | Open the command palette — fuzzy search across threads, documents, libraries, assistants, and quick actions |
| `Enter` | Send the message in the chat composer |
| `Shift + Enter` | Newline in the chat composer |
| `Esc` | Close the active modal / palette / overlay |
| `Tab` then `Enter` on focus | Skip-to-content link appears at the top of every page for keyboard users |

---

## Theming

Three modes selected from the topbar toggle:

1. **Light** — clean, high-contrast workspace.
2. **Dark** — softer surfaces, accent-tinted highlights, scrollbar adapts.
3. **System** — follows `prefers-color-scheme` and updates live when the user changes their OS setting mid-session.

All theme values are CSS variables defined in `styles.scss`. Components that need theme-aware variants check `body.theme-dark` for overrides. There are no `linear-gradient(rgba(255,255,255, ...))` colour patches left — every surface respects the active theme.

---

## Backend integration

The frontend talks to the Django backend via the services in `shared/services/`. Each service is a thin DRF-aware wrapper:

| Service | Backend resource |
|---|---|
| `AuthService` | `/login/`, `/register/`, `/logout/<token>/`, `/me/status/<token>/`, password reset |
| `OAuthService` | `/oauth/<provider>/start/`, `/oauth/<provider>/callback/` |
| `ConversationService` | `/conversation/...` — list, create, items, export |
| `ResponseService` | `/response/chat/<token>/` (SSE), polling, cancellation |
| `DocumentService` | ingest, list, status, move, preview, version history, restore |
| `DocumentShareService` | user-to-user document shares |
| `VectorStoreService` | library CRUD + stats |
| `AssistantService` | saved assistants / prompts |
| `LoadingService` + interceptor | drives the global top progress bar |

Auth tokens are stored in `localStorage` under `auth_token`. The `AuthInterceptor` injects them into outbound requests. The `RetryInterceptor` re-issues idempotent GETs once on status 0 / 502 / 503 / 504. The `ApiErrorAlertInterceptor` surfaces unexpected HTTP errors via the toast service unless the call opts out with `SKIP_API_ERROR_ALERT`.

---

## Development tips

### Adding a component

1. Generate it under the right feature module (`auth/`, `home/`, `workspace/`, `settings/`, `setup/`) or in `shared/components/` if it's reusable.
2. Add it to the module's `declarations` (or set `standalone: true` and add it to the host's `imports`).
3. Use the existing **OnPush** pattern where you can — most lists in this codebase are already on it. New leaf components should default to OnPush.

### Adding a service

1. `@Injectable({ providedIn: 'root' })` for app-wide singletons.
2. Inject `ApiService` for HTTP and `AuthService` if you need a token.
3. Use the `HttpContext` tokens (`SKIP_LOADING`, `SKIP_API_ERROR_ALERT`) to opt specific calls out of the global loader and global error toast — useful for speculative requests like hover previews.

### Adding a setting

1. Backend: env var in `.env.example` → consumed in `project/settings.py`.
2. Frontend: surface via `AuthService.userStatus$` or a dedicated service. Never read backend env vars directly from the FE.

### Styling

- Tokens (colours, spacing) live in `styles.scss` as CSS variables on `:root` and `body.theme-dark`.
- The global tooltip system is opt-in: add `data-tooltip="…"` to any element.
- Skeleton loading: `<app-skeleton variant="list-item" [count]="6"></app-skeleton>` (or `doc-card`, `card`, `text`, `rect`, `circle`).
- Toast: inject `ToastService` and call `success` / `info` / `warning` / `error`.

---

## Troubleshooting

**CORS errors** — make sure the backend's `CORS_ALLOWED_ORIGINS` includes your frontend origin (default `http://localhost:4200`).

**Login works but every API call 401s** — the token isn't being sent. Check that the request URL matches the backend pattern (`/<endpoint>/<token>/`); the `AuthInterceptor` won't help if the URL itself is wrong.

**OAuth button toast says "not configured"** — the backend doesn't have `OAUTH_<PROVIDER>_CLIENT_ID/SECRET` set. See [`../RAG/.env.example`](../RAG/.env.example).

**Password reset link never arrives in dev** — the dev email backend prints to the runserver console rather than sending mail. Check the Django runserver output.

**`@angular/cdk` not found** — run `npm install` (the dependency was added for the virtual-scroll thread sidebar).

**Streaming chat hangs forever** — check the browser network tab for the SSE connection. The backend uses `EventSource`-style server-sent events; some corporate proxies strip the `text/event-stream` content type and buffer the response, breaking streaming entirely.

---

## Contributing

1. Branch off `master`.
2. `npm run build` should stay clean.
3. Keep new components OnPush by default and follow the existing folder structure.
4. Don't introduce a new state-management library — services and `BehaviorSubject`s are the convention.

---

## License

MIT — see [LICENSE](LICENSE).
