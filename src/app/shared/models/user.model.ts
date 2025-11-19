export interface User {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  tenant: number;
}

export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
  tenant_name: string;
  collection_name?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

