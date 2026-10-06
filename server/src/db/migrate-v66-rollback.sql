/* Quay lui v66: bo quy trinh theo trang thai. Mat cac buoc da tao — rollbackTo()
   da sao luu CSDL truoc khi chay. */
DROP TABLE IF EXISTS card_flow_steps;
DROP TABLE IF EXISTS card_flows;
DELETE FROM app_settings WHERE key LIKE 'task\_flow.%' ESCAPE '\';
