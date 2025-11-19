# Angular 17 RAG Frontend Architecture

## Overview

This document describes the complete Angular 17 frontend architecture for the RAG application, including all components, services, and their interactions.

## Project Structure

```
src/app/
├── app.module.ts                    # Root module with routing
├── app.component.*                   # Root component
│
├── shared/                           # SharedModule
│   ├── models/                       # TypeScript interfaces
│   │   ├── user.model.ts
│   │   ├── vector-store.model.ts
│   │   ├── document.model.ts
│   │   ├── assistant.model.ts
│   │   ├── thread.model.ts
│   │   ├── message.model.ts
│   │   ├── run.model.ts
│   │   ├── openai-key.model.ts
│   │   └── document-access.model.ts
│   ├── services/                     # API services
│   │   ├── api.service.ts           # Base HTTP service
│   │   ├── auth.service.ts
│   │   ├── vector-store.service.ts
│   │   ├── document.service.ts
│   │   ├── assistant.service.ts
│   │   ├── thread.service.ts
│   │   ├── message.service.ts
│   │   ├── run.service.ts           # Includes polling
│   │   ├── openai-key.service.ts
│   │   └── document-access.service.ts
│   ├── interceptors/
│   │   └── auth.interceptor.ts      # Token injection
│   └── shared.module.ts
│
├── auth/                             # AuthModule
│   ├── components/
│   │   ├── login/
│   │   │   ├── login.component.ts
│   │   │   ├── login.component.html
│   │   │   └── login.component.scss
│   │   └── register/
│   │       ├── register.component.ts
│   │       ├── register.component.html
│   │       └── register.component.scss
│   ├── guards/
│   │   └── auth.guard.ts            # Route protection
│   ├── auth-routing.module.ts
│   └── auth.module.ts
│
├── home/                             # HomeModule
│   ├── components/
│   │   ├── home/                    # Main container
│   │   ├── chat-container/          # Message list
│   │   ├── chat-input/              # Input with mode toggle
│   │   ├── message-bubble/          # Individual messages
│   │   ├── model-selector/          # Model dropdown
│   │   ├── thread-sidebar/          # Thread list
│   │   └── empty-state/             # Welcome screen
│   ├── home-routing.module.ts
│   └── home.module.ts
│
└── workspace/                        # WorkspaceModule
    ├── components/
    │   ├── workspace-layout/        # Main container
    │   ├── models-section/          # Model management
    │   ├── knowledge-section/       # Document upload
    │   ├── prompts-section/         # Assistant instructions
    │   ├── tools-section/           # Tool management
    │   ├── document-upload/         # File upload component
    │   ├── vector-store-list/       # Vector store display
    │   └── assistant-form/          # Assistant form (placeholder)
    ├── workspace-routing.module.ts
    └── workspace.module.ts
```

## Component Details

### HomePage Components

#### HomeComponent
- **Location**: `home/components/home/`
- **Purpose**: Main container for chat interface
- **Features**:
  - Auto-creates VectorStore, Thread, Assistant on first message
  - Manages current thread and messages
  - Handles mode switching (normal/web)
  - Model selection
  - Logout functionality

#### ChatContainerComponent
- **Location**: `home/components/chat-container/`
- **Purpose**: Displays list of messages
- **Features**:
  - Renders message bubbles
  - Shows loading indicator during run processing

#### ChatInputComponent
- **Location**: `home/components/chat-input/`
- **Purpose**: Message input with mode toggle
- **Features**:
  - Text input with Enter key support
  - Web mode toggle button
  - Send button
  - Loading state

#### MessageBubbleComponent
- **Location**: `home/components/message-bubble/`
- **Purpose**: Individual message display
- **Features**:
  - User/assistant styling
  - Timestamp display
  - Text formatting

#### ModelSelectorComponent
- **Location**: `home/components/model-selector/`
- **Purpose**: Model selection dropdown
- **Features**:
  - Lists available models
  - Shows active model
  - Model switching

#### ThreadSidebarComponent
- **Location**: `home/components/thread-sidebar/`
- **Purpose**: Thread navigation
- **Features**:
  - Lists all threads
  - Highlights active thread
  - New thread creation
  - Time formatting

#### EmptyStateComponent
- **Location**: `home/components/empty-state/`
- **Purpose**: Welcome screen
- **Features**:
  - Suggested prompts
  - Welcome message

### Workspace Components

#### WorkspaceLayoutComponent
- **Location**: `workspace/components/workspace-layout/`
- **Purpose**: Main workspace container
- **Features**:
  - Section navigation (Models/Knowledge/Prompts/Tools)
  - Sidebar with navigation
  - Logout functionality

#### ModelsSectionComponent
- **Location**: `workspace/components/models-section/`
- **Purpose**: Model/API key management
- **Features**:
  - List existing models
  - Create new model (OpenAI/Ollama/Claude)
  - Set active model
  - Delete models
  - API key validation

#### KnowledgeSectionComponent
- **Location**: `workspace/components/knowledge-section/`
- **Purpose**: Document and vector store management
- **Features**:
  - Vector store selection
  - Document upload trigger
  - Document list with status
  - Status tracking

#### PromptsSectionComponent
- **Location**: `workspace/components/prompts-section/`
- **Purpose**: Assistant instruction management
- **Features**:
  - Create assistants with instructions
  - List existing assistants
  - Edit assistant prompts
  - Vector store association

#### ToolsSectionComponent
- **Location**: `workspace/components/tools-section/`
- **Purpose**: Tool management for assistants
- **Features**:
  - Select assistant
  - Add function tools
  - Add file_search tools
  - Tool parameter configuration
  - Tool list display

#### DocumentUploadComponent
- **Location**: `workspace/components/document-upload/`
- **Purpose**: File upload interface
- **Features**:
  - File selection
  - Vector store selection
  - Upload progress
  - Error handling

#### VectorStoreListComponent
- **Location**: `workspace/components/vector-store-list/`
- **Purpose**: Vector store display
- **Features**:
  - Lists vector stores
  - Selection functionality
  - Creation date display

## Service Architecture

### ApiService
- Base HTTP service with token management
- Methods: `get`, `post`, `put`, `delete`, `postFormData`
- Handles base URL and headers

### AuthService
- Authentication state management
- Token storage (localStorage)
- Login, register, logout
- User state (BehaviorSubject)

### Resource Services
All services follow the same pattern:
- `create()` - Create resource
- `list()` - List all resources
- `getById()` - Get single resource
- `update()` - Update resource
- `delete()` - Delete resource

Special methods:
- `RunService.pollRunStatus()` - Polls run status every 2s
- `MessageService.list(thread_id)` - Get thread messages
- `DocumentService.getStatus()` - Check document processing status

## Data Flow

### Authentication Flow
1. User visits `/auth/login`
2. Enters credentials or registers
3. Receives token and user data
4. Token stored in localStorage
5. Redirected to `/home`
6. Token injected via AuthInterceptor

### Home Page Message Flow
1. User types message and sends
2. `HomeComponent.onMessageSent()` triggered
3. Auto-creation sequence:
   - `ensureVectorStoreAndThread()` - Creates VS and Thread if needed
   - `ensureAssistant()` - Creates Assistant if needed
   - `createMessage()` - Creates user message
   - `createRun()` - Creates and starts run
4. Run status polling begins
5. When completed, assistant message appears

### Workspace Flow
1. User navigates to `/workspace`
2. Selects section (Models/Knowledge/Prompts/Tools)
3. Performs CRUD operations
4. Changes reflected immediately

## Routing

```
/ → redirects to /home
/auth
  /login → LoginComponent
  /register → RegisterComponent (embedded in login)
/home → HomeComponent
  /chat/:threadId → HomeComponent (with thread loaded)
/workspace → WorkspaceLayoutComponent
  (sections managed internally)
```

## State Management

- **AuthState**: Managed by `AuthService` (BehaviorSubject)
- **ThreadState**: Managed by `HomeComponent` (component state)
- **RunState**: Managed by `HomeComponent` (component state)
- **ModelState**: Managed by `HomeComponent` and `ModelsSectionComponent`

## Styling

- **Theme**: Dark theme with CSS variables
- **Colors**: Defined in `styles.scss` `:root`
- **Layout**: Flexbox-based responsive design
- **Components**: SCSS with BEM-like naming

## Key Features Implemented

✅ Authentication (login/register/logout)
✅ Token-based API authentication
✅ Auto-creation of VectorStore/Thread/Assistant
✅ Chat interface with message display
✅ Mode switching (normal/web)
✅ Model selection and switching
✅ Thread management
✅ Run status polling
✅ Document upload with progress
✅ Vector store management
✅ Assistant creation with instructions
✅ Tool creation and management
✅ Dark theme UI
✅ Open WebUI-inspired sidebar
✅ Error handling
✅ Loading states
✅ Form validation

## API Endpoint Patterns

All authenticated endpoints follow pattern:
- `POST /{resource}/{token}/` - Create
- `GET /{resource}/{token}/list/` - List
- `GET /{resource}/{token}/{id}/` - Get
- `PUT /{resource}/{token}/{id}/` - Update
- `DELETE /{resource}/{token}/{id}/` - Delete

Special endpoints:
- `/document/{token}/ingest/` - File upload (multipart)
- `/document/{token}/{id}/status/` - Status check
- `/thread/{token}/{id}/messages/` - Get messages
- `/run/{token}/{id}/cancel/` - Cancel run
- `/run/{token}/{id}/rerun/` - Rerun
- `/run/{token}/{id}/submit-tool-outputs/` - Submit tools

## Next Steps

1. Install dependencies: `npm install`
2. Configure API URL in `environment.ts`
3. Run development server: `npm start`
4. Test all flows
5. Add additional error handling as needed
6. Enhance UI/UX based on user feedback

