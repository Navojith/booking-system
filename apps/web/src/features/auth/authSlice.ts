import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@/api/types';

interface AuthState {
  user: User | null;
  /** `loading` until the first silent refresh settles. */
  status: 'loading' | 'authenticated' | 'anonymous';
}

const initialState: AuthState = { user: null, status: 'loading' };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn(state, action: PayloadAction<User>) {
      state.user = action.payload;
      state.status = 'authenticated';
    },
    signedOut(state) {
      state.user = null;
      state.status = 'anonymous';
    },
  },
});

export const { signedIn, signedOut } = authSlice.actions;
export const authReducer = authSlice.reducer;
