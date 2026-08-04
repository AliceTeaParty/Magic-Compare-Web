"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

export interface CaseDeployNavigationAction {
  disabled: boolean;
  disabledReason: string;
  loading: boolean;
  onClick: () => void;
}

export const CaseDeployNavigationActionContext = createContext<Dispatch<
  SetStateAction<CaseDeployNavigationAction | null>
> | null>(null);

/**
 * Registers the route-owned deploy command with the persistent navigation. A ref keeps the latest
 * mutation handler available without re-registering after every workspace render.
 */
export function useCaseDeployNavigationAction({
  disabled,
  disabledReason,
  loading,
  onClick,
}: CaseDeployNavigationAction) {
  const setNavigationAction = useContext(CaseDeployNavigationActionContext);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (!setNavigationAction) return;

    setNavigationAction({
      disabled,
      disabledReason,
      loading,
      onClick: () => onClickRef.current(),
    });

    return () => setNavigationAction(null);
  }, [disabled, disabledReason, loading, setNavigationAction]);
}
