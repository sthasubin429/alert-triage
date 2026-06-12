import { EMPTY_FILTER } from '@/lib/types';
import type {
  Alert,
  AlertFilter,
  FilterToggle,
  SortKey,
  SortSpec,
  Status,
} from '@/lib/types';

export interface TriageState {
  alerts: Alert[];
  filter: AlertFilter;
  search: string;
  sort: SortSpec;
  selectedId: string | null;
  drawerOpen: boolean;
}

export type TriageAction =
  | { type: 'SET_STATUS'; id: string; status: Status }
  | { type: 'SELECT'; id: string | null }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'MOVE_SELECTION'; delta: 1 | -1; visibleIds: readonly string[] }
  | { type: 'SET_FILTER'; filter: Partial<AlertFilter> }
  | ({ type: 'TOGGLE_FILTER' } & FilterToggle)
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SET_SORT'; key: SortKey };

export function initialTriageState(alerts: readonly Alert[]): TriageState {
  return {
    alerts: [...alerts],
    filter: EMPTY_FILTER,
    search: '',
    sort: { key: 'createdAt', direction: 'desc' },
    selectedId: null,
    drawerOpen: false,
  };
}

function defaultDirectionFor(key: SortKey): SortSpec['direction'] {
  return key === 'createdAt' || key === 'severity' ? 'desc' : 'asc';
}

/** Removes the value when present, appends it when absent. */
function toggleValue<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}

function nextSelectedId(
  selectedId: string | null,
  delta: 1 | -1,
  visibleIds: readonly string[],
): string {
  const index = selectedId === null ? -1 : visibleIds.indexOf(selectedId);
  if (index === -1) {
    return delta === 1 ? visibleIds[0] : visibleIds[visibleIds.length - 1];
  }
  const next = Math.min(Math.max(index + delta, 0), visibleIds.length - 1);
  return visibleIds[next];
}

export function triageReducer(
  state: TriageState,
  action: TriageAction,
): TriageState {
  switch (action.type) {
    case 'SET_STATUS': {
      if (!state.alerts.some((alert) => alert.id === action.id)) {
        return state;
      }
      return {
        ...state,
        alerts: state.alerts.map((alert) =>
          alert.id === action.id ? { ...alert, status: action.status } : alert,
        ),
      };
    }
    case 'SELECT': {
      if (action.id === null) {
        return { ...state, selectedId: null, drawerOpen: false };
      }
      return { ...state, selectedId: action.id, drawerOpen: true };
    }
    case 'CLOSE_DRAWER':
      return { ...state, drawerOpen: false };
    case 'MOVE_SELECTION': {
      if (action.visibleIds.length === 0) {
        return state;
      }
      return {
        ...state,
        selectedId: nextSelectedId(
          state.selectedId,
          action.delta,
          action.visibleIds,
        ),
      };
    }
    case 'SET_FILTER':
      return { ...state, filter: { ...state.filter, ...action.filter } };
    case 'TOGGLE_FILTER': {
      const { filter } = state;
      switch (action.key) {
        case 'severity':
          return {
            ...state,
            filter: {
              ...filter,
              severity: toggleValue(filter.severity, action.value),
            },
          };
        case 'status':
          return {
            ...state,
            filter: {
              ...filter,
              status: toggleValue(filter.status, action.value),
            },
          };
        case 'source':
          return {
            ...state,
            filter: {
              ...filter,
              source: toggleValue(filter.source, action.value),
            },
          };
      }
    }
    case 'SET_SEARCH':
      return { ...state, search: action.search };
    case 'SET_SORT': {
      if (state.sort.key === action.key) {
        return {
          ...state,
          sort: {
            key: action.key,
            direction: state.sort.direction === 'asc' ? 'desc' : 'asc',
          },
        };
      }
      return {
        ...state,
        sort: { key: action.key, direction: defaultDirectionFor(action.key) },
      };
    }
  }
}
