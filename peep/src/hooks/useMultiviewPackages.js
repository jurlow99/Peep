import { useEffect, useState } from "react";
import { supabase } from "../supabase";
const queryPackages = () => supabase.from("multiview_packages").select("*").order("position").order("created_at");
export function useMultiviewPackages() {
  const [packages, setPackages] = useState([]);
  const [error, setError] = useState("");
  const reload = async () => {
    const result = await queryPackages();
    setError(result.error?.message || "");
    if (!result.error) setPackages(result.data || []);
  };
  useEffect(() => {
    let active = true;
    queryPackages().then(result => {
      if (!active) return;
      setError(result.error?.message || "");
      if (!result.error) setPackages(result.data || []);
    });
    return () => { active = false; };
  }, []);
  return { packages, error, reload };
}
