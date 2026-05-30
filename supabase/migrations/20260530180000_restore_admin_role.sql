-- Restore a user to super_admin (run in SQL Editor when an admin was wrongly linked as driver)
-- Example: replace USER_ID with auth.users.id

-- UPDATE public.drivers SET user_id = NULL WHERE user_id = 'USER_ID';
-- DELETE FROM public.user_roles WHERE user_id = 'USER_ID';
-- INSERT INTO public.user_roles (user_id, role) VALUES ('USER_ID', 'super_admin');
