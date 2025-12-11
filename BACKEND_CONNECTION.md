# Backend Connection Configuration

## Backend URL
**Production Backend**: `https://rag.xamplify.co/rag`

## Environment Configuration

### Development (`src/environments/environment.ts`)
```typescript
apiUrl: 'https://rag.xamplify.co/rag'
```

### Production (`src/environments/environment.prod.ts`)
```typescript
apiUrl: 'https://rag.xamplify.co/rag'
```

## API Endpoints Mapping

All endpoints are configured to match the Django backend URL structure:

### Authentication
- `POST /login/` - User login
- `POST /register/` - User registration
- `POST /logout/{token}/` - User logout
- `GET /protected/{token}/` - Token verification

### Vector Stores
- `POST /vector-store/{token}/` - Create vector store
- `GET /vector-store/{token}/list/` - List vector stores
- `GET /vector-store/{token}/{id}/` - Get vector store
- `PUT /vector-store/{token}/{id}/` - Update vector store
- `DELETE /vector-store/{token}/{id}/` - Delete vector store

### Documents
- `POST /document/{token}/ingest/` - Upload document (FormData)
- `GET /document/{token}/list/` - List documents
- `GET /document/{token}/{id}/` - Get document
- `GET /document/{token}/{document_id}/status/` - Get document status
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
- `PUT /thread/{token}/{id}/` - Update thread
- `DELETE /thread/{token}/{id}/` - Delete thread
- `GET /thread/{token}/{thread_id}/messages/` - Get thread messages

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
- `PUT /run/{token}/{id}/` - Update run
- `DELETE /run/{token}/{id}/` - Delete run
- `POST /run/{token}/{run_id}/cancel/` - Cancel run
- `POST /run/{token}/{run_id}/rerun/` - Rerun
- `POST /run/{token}/{run_id}/submit-tool-outputs/` - Submit tool outputs

### OpenAI Keys
- `POST /llm-config/{token}/` - Create OpenAI key
- `GET /llm-config/{token}/list/` - List OpenAI keys
- `GET /llm-config/{token}/{id}/` - Get OpenAI key
- `PUT /llm-config/{token}/{id}/` - Update OpenAI key
- `DELETE /llm-config/{token}/{id}/` - Delete OpenAI key

### Document Access
- `POST /document-access/{token}/` - Create document access
- `GET /document-access/{token}/list/` - List document access
- `POST /document-access/remove/{token}/` - Remove document access

## Authentication

The frontend uses token-based authentication:
- Token is stored in `localStorage` with key `auth_token`
- Token is automatically injected into all API requests via `AuthInterceptor`
- Authorization header format: `Authorization: Token {token}`

## CORS Configuration

**Note**: The backend at `https://rag.xamplify.co/rag` must have CORS configured to allow requests from your frontend domain. If you encounter CORS errors, ensure the backend has:

```python
# In Django settings.py
CORS_ALLOWED_ORIGINS = [
    "http://localhost:4200",  # Development
    "https://your-frontend-domain.com",  # Production
]

CORS_ALLOW_CREDENTIALS = True
```

## Testing the Connection

1. Start the Angular development server:
   ```bash
   ng serve
   ```

2. Navigate to `http://localhost:4200`

3. Try to register/login - this will test the connection to the backend

4. Check browser console for any CORS or connection errors

## Troubleshooting

### CORS Errors
If you see CORS errors in the browser console:
- Verify the backend CORS settings allow your frontend origin
- Check that the backend is accessible from your network
- Verify the backend URL is correct

### 401 Unauthorized
- Check that the token is being stored correctly in localStorage
- Verify the token format matches backend expectations
- Ensure the AuthInterceptor is properly configured

### 404 Not Found
- Verify the endpoint paths match exactly with the backend URLs
- Check that the base URL is correct (should end without trailing slash)
- Ensure the token is being inserted correctly in the URL

### Network Errors
- Verify the backend is running and accessible
- Check firewall/network settings
- Test the backend URL directly in a browser or Postman

