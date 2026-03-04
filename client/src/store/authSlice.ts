import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '../services/api';
import { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  loading: false,
  error: null,
};

export const register = createAsyncThunk(
  'auth/register',
  async (data: { username: string; email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authApi.register(data);
      localStorage.setItem('accessToken', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      return response.data.user;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Registration failed');
    }
  }
);

export const login = createAsyncThunk(
  'auth/login',
  async (data: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authApi.login(data);
      localStorage.setItem('accessToken', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      return response.data.user;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Login failed');
    }
  }
);

export const fetchUser = createAsyncThunk(
  'auth/fetchUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authApi.getMe();
      return response.data.user;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch user');
    }
  }
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (data: Record<string, string>, { rejectWithValue }) => {
    try {
      const response = await authApi.updateProfile(data);
      return response.data.user;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Update failed');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.isAuthenticated = false;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    },
    clearError(state) {
      state.error = null;
    },
    setUserStatus(state, action: PayloadAction<string>) {
      if (state.user) {
        state.user.status = action.payload as User['status'];
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(register.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(login.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
        // Apply user's saved theme
        if (action.payload.theme) {
          localStorage.setItem('theme', action.payload.theme);
          document.documentElement.setAttribute('data-theme', action.payload.theme);
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        if (action.payload.theme) {
          localStorage.setItem('theme', action.payload.theme);
          document.documentElement.setAttribute('data-theme', action.payload.theme);
        }
      })
      .addCase(fetchUser.rejected, (state) => {
        state.isAuthenticated = false;
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.user = action.payload;
      });
  },
});

export const { logout, clearError, setUserStatus } = authSlice.actions;
export default authSlice.reducer;
