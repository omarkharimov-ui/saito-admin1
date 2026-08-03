CREATE FUNCTION public.unmerge_tables_v4 (
  p_primary_table    integer,
  p_tables_to_detach integer[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
DECLARE
  v_table_num INTEGER;
BEGIN
  FOREACH v_table_num IN ARRAY p_tables_to_detach LOOP
    UPDATE orders SET group_id = NULL 
    WHERE table_number = v_table_num AND status = 'confirmed';
    
    UPDATE table_floors SET merged_into_table = NULL 
    WHERE table_number = v_table_num;
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT ALL ON FUNCTION public.unmerge_tables_v4(integer, integer[]) TO anon;

GRANT ALL ON FUNCTION public.unmerge_tables_v4(integer, integer[]) TO authenticated;

GRANT ALL ON FUNCTION public.unmerge_tables_v4(integer, integer[]) TO service_role;