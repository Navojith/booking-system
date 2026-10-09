import { configureStore } from '@reduxjs/toolkit';
import { configureAuth } from '@/api/http';
import { authReducer, signedIn, signedOut } from '@/features/auth/authSlice';
import { queryClient } from './queryClient';

export const store = configureStore({ reducer: { auth: authReducer } });

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

configureAuth({
  onRefreshed: (user) => store.dispatch(signedIn(user)),
  onLost: () => {
    store.dispatch(signedOut());
    queryClient.clear();
  },
});
