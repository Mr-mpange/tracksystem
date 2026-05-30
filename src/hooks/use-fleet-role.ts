import { useQuery } from "@tanstack/react-query";
import { getFleetContext } from "@/lib/fleet-auth";

export function useFleetRole() {
  return useQuery({
    queryKey: ["fleet-context"],
    queryFn: getFleetContext,
    staleTime: 60_000,
  });
}
