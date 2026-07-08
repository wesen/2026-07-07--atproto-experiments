// A minimal toast notifications slice. Replaces os-core's notificationsReducer
// for this standalone page. Plugins emit `notify.show` actions; the host maps
// them to addToast() (see pluginIntentRouting.ts).
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface Toast {
  id: string;
  message: string;
  level?: 'info' | 'success' | 'warning' | 'error';
}

export interface ToastsState {
  items: Toast[];
}

const initialState: ToastsState = { items: [] };

let counter = 0;
function nextToastId(): string {
  counter += 1;
  return `toast-${Date.now()}-${counter}`;
}

const toastsSlice = createSlice({
  name: 'toasts',
  initialState,
  reducers: {
    addToast: {
      reducer(state, action: PayloadAction<Toast>) {
        state.items.push(action.payload);
        if (state.items.length > 8) {
          state.items.shift();
        }
      },
      prepare(message: string, level: Toast['level'] = 'info') {
        return { payload: { id: nextToastId(), message, level } };
      },
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.items = state.items.filter((toast) => toast.id !== action.payload);
    },
    clearToasts(state) {
      state.items = [];
    },
  },
});

export const { addToast, dismissToast, clearToasts } = toastsSlice.actions;
export const toastsReducer = toastsSlice.reducer;
