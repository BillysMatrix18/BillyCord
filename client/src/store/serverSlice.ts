import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { serverApi } from '../services/api';
import { Server, ServerMember, Role } from '../types';

interface ServerState {
  servers: Server[];
  currentServer: Server | null;
  members: ServerMember[];
  roles: Role[];
  loading: boolean;
  error: string | null;
}

const initialState: ServerState = {
  servers: [],
  currentServer: null,
  members: [],
  roles: [],
  loading: false,
  error: null,
};

export const fetchServers = createAsyncThunk('servers/fetchAll', async (_, { rejectWithValue }) => {
  try {
    const response = await serverApi.getAll();
    return response.data.servers;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } };
    return rejectWithValue(error.response?.data?.error || 'Failed to fetch servers');
  }
});

export const fetchServer = createAsyncThunk('servers/fetchOne', async (serverId: string, { rejectWithValue }) => {
  try {
    const response = await serverApi.get(serverId);
    return response.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } };
    return rejectWithValue(error.response?.data?.error || 'Failed to fetch server');
  }
});

export const createServer = createAsyncThunk(
  'servers/create',
  async (data: { name: string; description?: string }, { rejectWithValue }) => {
    try {
      const response = await serverApi.create(data);
      return response.data.server;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Failed to create server');
    }
  }
);

export const joinServer = createAsyncThunk(
  'servers/join',
  async (code: string, { rejectWithValue }) => {
    try {
      const response = await serverApi.join(code);
      return response.data.server;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      return rejectWithValue(error.response?.data?.error || 'Failed to join server');
    }
  }
);

const serverSlice = createSlice({
  name: 'servers',
  initialState,
  reducers: {
    setCurrentServer(state, action: PayloadAction<Server | null>) {
      state.currentServer = action.payload;
    },
    clearServerError(state) {
      state.error = null;
    },
    updateMemberStatus(state, action: PayloadAction<{ userId: string; status: string }>) {
      const member = state.members.find(m => m.id === action.payload.userId);
      if (member) {
        member.status = action.payload.status;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchServers.pending, (state) => { state.loading = true; })
      .addCase(fetchServers.fulfilled, (state, action) => {
        state.loading = false;
        state.servers = action.payload;
      })
      .addCase(fetchServers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchServer.fulfilled, (state, action) => {
        state.currentServer = action.payload.server;
        state.members = action.payload.members;
        state.roles = action.payload.roles;
      })
      .addCase(createServer.fulfilled, (state, action) => {
        state.servers.push(action.payload);
      })
      .addCase(joinServer.fulfilled, (state, action) => {
        state.servers.push(action.payload);
      });
  },
});

export const { setCurrentServer, clearServerError, updateMemberStatus } = serverSlice.actions;
export default serverSlice.reducer;
