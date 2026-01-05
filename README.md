# RAG Frontend Application

Angular 17 frontend application for the RAG (Retrieval-Augmented Generation) system.

## Features

- **Authentication**: User registration and login with token-based authentication
- **Home Page**: Chat interface with auto-creation of VectorStore, Thread, and Assistant
- **Workspace**: Manage Models, Knowledge (documents), Prompts (assistants), and Tools
- **Dark Theme**: Open WebUI-inspired dark theme interface
- **Real-time Updates**: Run status polling for async operations

## Project Structure

```
src/
├── app/
│   ├── auth/              # Authentication module
│   │   ├── components/   # Login, Register components
│   │   ├── guards/        # Auth guard
│   │   └── auth.module.ts
│   ├── home/              # Home/chat module
│   │   ├── components/   # Chat components
│   │   └── home.module.ts
│   ├── workspace/         # Workspace module
│   │   ├── components/   # Models, Knowledge, Prompts, Tools
│   │   └── workspace.module.ts
│   ├── shared/            # Shared module
│   │   ├── models/       # TypeScript interfaces
│   │   ├── services/     # API services
│   │   ├── interceptors/ # HTTP interceptors
│   │   └── shared.module.ts
│   └── app.module.ts      # Root module
├── environments/          # Environment configuration
└── styles.scss           # Global styles
```

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure API URL**
   - Edit `src/environments/environment.ts`
   - Set `apiUrl` to your backend API URL (default: `http://localhost:8000`)

3. **Run Development Server**
   ```bash
   npm start
   ```
   The application will be available at `http://localhost:4200`

4. **Build for Production**
   ```bash
   npm run build
   ```

## API Integration

The frontend integrates with the following backend APIs:

### Authentication
- `POST /register/` - User registration
- `POST /login/` - User login
- `POST /logout/{token}/` - User logout
- `GET /protected/{token}/` - Token verification

### Vector Stores
- `POST /vector-store/{token}/` - Create vector store
- `GET /vector-store/{token}/list/` - List vector stores
- `GET /vector-store/{token}/{id}/` - Get vector store
- `PUT /vector-store/{token}/{id}/` - Update vector store
- `DELETE /vector-store/{token}/{id}/` - Delete vector store

### Documents
- `POST /document/{token}/ingest/` - Upload document
- `GET /document/{token}/list/` - List documents
- `GET /document/{token}/{id}/status/` - Get document status
- `GET /document/{token}/{id}/` - Get document
- `PUT /document/{token}/{id}/` - Update document
- `DELETE /document/{token}/{id}/` - Delete document

### Assistants
- `POST /assistant/{token}/` - Create assistant
- `GET /assistant/{token}/list/` - List assistants
- `GET /assistant/{token}/{id}/` - Get assistant
- `PUT /assistant/{token}/{id}/` - Update assistant
- `DELETE /assistant/{token}/{id}/` - Delete assistant

### Threads
- `POST /thread/{token}/` - Create thread
- `GET /thread/{token}/list/` - List threads
- `GET /thread/{token}/{id}/` - Get thread
- `GET /thread/{token}/{id}/messages/` - Get thread messages
- `PUT /thread/{token}/{id}/` - Update thread
- `DELETE /thread/{token}/{id}/` - Delete thread

### Messages
- `POST /message/{token}/` - Create message
- `GET /message/{token}/list/` - List messages
- `GET /message/{token}/{id}/` - Get message
- `PUT /message/{token}/{id}/` - Update message
- `DELETE /message/{token}/{id}/` - Delete message

### Runs
- `POST /run/{token}/` - Create run
- `GET /run/{token}/list/` - List runs
- `GET /run/{token}/{id}/` - Get run
- `POST /run/{token}/{id}/cancel/` - Cancel run
- `POST /run/{token}/{id}/rerun/` - Rerun
- `POST /run/{token}/{id}/submit-tool-outputs/` - Submit tool outputs

### OpenAI Keys (Models)
- `POST /llm-config/{token}/` - Create API key/model
- `GET /llm-config/{token}/list/` - List models
- `GET /llm-config/{token}/{id}/` - Get model
- `PUT /llm-config/{token}/{id}/` - Update model
- `DELETE /llm-config/{token}/{id}/` - Delete model

### Document Access
- `POST /document-access/{token}/` - Grant document access
- `GET /document-access/{token}/list/` - List document access
- `PUT /document-access/remove/{token}/` - Remove document access
- `DELETE /document-access/{token}/{id}/` - Delete document access

## Key Features

### Home Page
- **Auto-Creation Flow**: When a user sends their first message, the system automatically:
  1. Creates a VectorStore (if none exists)
  2. Creates a Thread
  3. Creates an Assistant
  4. Creates the Message
  5. Creates and processes a Run
- **Mode Switching**: Toggle between "normal" (chat) and "web" (web search) modes
- **Model Selection**: Switch between available models
- **Thread Management**: View and switch between conversation threads

### Workspace
- **Models**: Create and manage OpenAI/Ollama API keys and models
- **Knowledge**: Upload documents to vector stores, track upload status
- **Prompts**: Create and manage assistant instructions
- **Tools**: Add function tools and file search tools to assistants

## Development

### Adding New Components
1. Create component in appropriate module directory
2. Declare in module's `declarations` array
3. Export if needed in other modules

### Adding New Services
1. Create service in `shared/services/`
2. Use `ApiService` for HTTP calls
3. Inject `AuthService` for token management

### Styling
- Global styles in `src/styles.scss`
- Component-specific styles use SCSS
- Dark theme variables defined in `:root`

## Troubleshooting

### CORS Issues
Ensure your backend API has CORS enabled for `http://localhost:4200`

### Token Issues
- Tokens are stored in localStorage
- Check browser console for authentication errors
- Verify token format matches backend expectations

### API Connection
- Verify `apiUrl` in `environment.ts`
- Check backend server is running
- Verify API endpoints match backend routes

