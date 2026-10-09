import { configureStore } from '@reduxjs/toolkit';

// Slices (auth, ui) are registered here as features are added.
export const store = configureStore({ reducer: {} });

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
