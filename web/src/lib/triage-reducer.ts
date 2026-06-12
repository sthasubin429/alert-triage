import { EMPTY_FILTER } from '@/lib/types';
import type {
  Alert,
  AlertFilter,
  FilterToggle,
  SortKey,
  SortSpec,
  Status,
} from '@/lib/types';
import { builtinViews, isValidViewName, nextViewId } from '@/lib/saved-views';
import type { SavedView } from '@/lib/saved-views';

export interface StatusChange {
  id: string;
  from: Status;
  to: Status;
}

/** Oldest entries fall off once the stack is full. */
export const UNDO_LIMIT = 20;

export interface TriageState {
  alerts: Alert[];
  filter: AlertFilter;
  search: string;
  sort: SortSpec;
  selectedId: string | null;
  drawerOpen: boolean;
  /** Built-in views first, then analyst-created ones, in tab order. */
  views: readonly SavedView[];
  /** null = the live query has diverged from every saved view. */
  activeViewId: string | null;
  undoStack: readonly StatusChange[];
  /** The most recent status change; drives the undo toast. */
  lastStatusChange: StatusChange | null;
}

export type TriageAction =
  | {
      type: 'SET_STATUS';
      id: string;
      status: Status;
      /**
       * When set and the target is the selected alert, selection advances to
       * the following id in this list (previous if last, null if only one).
       */
      advanceWithin?: readonly string[];
    }
  | { type: 'SELECT'; id: string | null }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'MOVE_SELECTION'; delta: 1 | -1; visibleIds: readonly string[] }
  | { type: 'SET_FILTER'; filter: Partial<AlertFilter> }
  | ({ type: 'TOGGLE_FILTER' } & FilterToggle)
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SET_SORT'; key: SortKey }
  | { type: 'APPLY_VIEW'; id: string }
  | { type: 'SAVE_VIEW'; name: string }
  | { type: 'DELETE_VIEW'; id: string }
  | { type: 'HYDRATE_VIEWS'; views: readonly SavedView[] }
  | { type: 'UNDO' };

export function initialTriageState(alerts: readonly Alert[]): TriageState {
  return {
    alerts: [...alerts],
    filter: EMPTY_FILTER,
    search: '',
    sort: { key: 'createdAt', direction: 'desc' },
    selectedId: null,
    drawerOpen: false,
    views: builtinViews(),
    activeViewId: 'builtin-all',
    undoStack: [],
    lastStatusChange: null,
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

function advancedSelection(
  selectedId: string | null,
  disposedId: string,
  advanceWithin: readonly string[] | undefined,
): string | null {
  if (advanceWithin === undefined || selectedId !== disposedId) {
    return selectedId;
  }
  const index = advanceWithin.indexOf(disposedId);
  if (index === -1) return selectedId;
  if (advanceWithin.length === 1) return null;
  return advanceWithin[
    index === advanceWithin.length - 1 ? index - 1 : index + 1
  ];
}

export function triageReducer(
  state: TriageState,
  action: TriageAction,
): TriageState {
  switch (action.type) {
    case 'SET_STATUS': {
      const target = state.alerts.find((alert) => alert.id === action.id);
      if (target === undefined || target.status === action.status) {
        return state;
      }
      const change: StatusChange = {
        id: action.id,
        from: target.status,
        to: action.status,
      };
      return {
        ...state,
        alerts: state.alerts.map((alert) =>
          alert.id === action.id ? { ...alert, status: action.status } : alert,
        ),
        selectedId: advancedSelection(
          state.selectedId,
          action.id,
          action.advanceWithin,
        ),
        undoStack: [...state.undoStack, change].slice(-UNDO_LIMIT),
        lastStatusChange: change,
      };
    }
    case 'UNDO': {
      const entry = state.undoStack[state.undoStack.length - 1];
      if (entry === undefined) {
        return state;
      }
      return {
        ...state,
        alerts: state.alerts.map((alert) =>
          alert.id === entry.id ? { ...alert, status: entry.from } : alert,
        ),
        undoStack: state.undoStack.slice(0, -1),
        // Re-select the reverted alert so the undo is visible in the table.
        selectedId: entry.id,
        lastStatusChange: null,
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
    case 'APPLY_VIEW': {
      const view = state.views.find((v) => v.id === action.id);
      if (view === undefined) {
        return state;
      }
      return {
        ...state,
        filter: view.query.filter,
        search: view.query.search,
        sort: view.query.sort,
        activeViewId: view.id,
      };
    }
    case 'SAVE_VIEW': {
      if (!isValidViewName(state.views, action.name)) {
        return state;
      }
      const view: SavedView = {
        id: nextViewId(state.views),
        name: action.name.trim(),
        builtIn: false,
        query: { filter: state.filter, search: state.search, sort: state.sort },
      };
      return { ...state, views: [...state.views, view], activeViewId: view.id };
    }
    case 'DELETE_VIEW': {
      const view = state.views.find((v) => v.id === action.id);
      if (view === undefined || view.builtIn) {
        return state;
      }
      const views = state.views.filter((v) => v.id !== action.id);
      if (state.activeViewId !== action.id) {
        return { ...state, views };
      }
      // Deleting the active tab falls back to "All alerts" deterministically.
      const all = views.find((v) => v.id === 'builtin-all');
      if (all === undefined) {
        return { ...state, views, activeViewId: null };
      }
      return {
        ...state,
        views,
        filter: all.query.filter,
        search: all.query.search,
        sort: all.query.sort,
        activeViewId: all.id,
      };
    }
    case 'HYDRATE_VIEWS': {
      return {
        ...state,
        views: [
          ...state.views.filter((v) => v.builtIn),
          ...action.views.map((v) => ({ ...v, builtIn: false })),
        ],
      };
    }
    case 'SET_FILTER':
      return {
        ...state,
        filter: { ...state.filter, ...action.filter },
        activeViewId: null,
      };
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
            activeViewId: null,
          };
        case 'status':
          return {
            ...state,
            filter: {
              ...filter,
              status: toggleValue(filter.status, action.value),
            },
            activeViewId: null,
          };
        case 'source':
          return {
            ...state,
            filter: {
              ...filter,
              source: toggleValue(filter.source, action.value),
            },
            activeViewId: null,
          };
        case 'assignee':
          return {
            ...state,
            filter: {
              ...filter,
              assignee: toggleValue(filter.assignee, action.value),
            },
            activeViewId: null,
          };
      }
    }
    case 'SET_SEARCH':
      return { ...state, search: action.search, activeViewId: null };
    case 'SET_SORT': {
      if (state.sort.key === action.key) {
        return {
          ...state,
          sort: {
            key: action.key,
            direction: state.sort.direction === 'asc' ? 'desc' : 'asc',
          },
          activeViewId: null,
        };
      }
      return {
        ...state,
        sort: { key: action.key, direction: defaultDirectionFor(action.key) },
        activeViewId: null,
      };
    }
  }
}
