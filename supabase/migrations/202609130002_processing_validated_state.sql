-- Align the durable workflow state enum with the application pipeline.

alter type public.processing_job_state
  add value if not exists 'validated' after 'normalized';
