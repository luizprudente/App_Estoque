-- =====================================================================
--  DI FORNI — ROLETA DE LEADS — BANCO DE DADOS (Supabase / PostgreSQL)
--  Cole este arquivo inteiro no SQL Editor do Supabase e clique em RUN.
--  Pode rodar de novo sem problema: ele não apaga dados existentes.
-- =====================================================================
--  Segurança em uma frase: o cliente (página pública) NÃO lê nenhuma
--  tabela. Ele só chama duas funções: dados_publicos() e girar().
--  Sorteio, limite de 1 giro por celular e código do cupom acontecem
--  aqui dentro do banco. O painel exige login de alguém da tabela equipe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------

-- Configuração da campanha (uma linha só)
create table if not exists public.config (
  id                    int primary key default 1 check (id = 1),
  campanha_ativa        boolean not null default true,
  validade_dias         int not null default 7 check (validade_dias between 1 and 90),
  prefixo_codigo        text not null default 'DF' check (prefixo_codigo ~ '^[A-Z0-9]{1,6}$'),
  link_google           text not null default 'https://g.page/r/CdIrbe-eaxm3EBM/review',
  consentimento_texto   text not null default 'Autorizo a Di Forni Pizzaria a usar meu nome e celular para validar o prêmio e me enviar promoções por WhatsApp/SMS. Posso cancelar quando quiser.',
  consentimento_versao  text not null default '2026-10-v1',
  regras                text not null default 'Válido 1 giro por celular. Prêmio pessoal, uso único, apresentado no pedido com o mesmo celular. Não cumulativo com outras promoções.',
  atualizado_em         timestamptz not null default now()
);
insert into public.config (id) values (1) on conflict (id) do nothing;

-- Fatias da roleta
create table if not exists public.premios (
  id              bigint generated always as identity primary key,
  ordem           int not null default 0,             -- posição na roleta (sentido horário a partir do topo)
  texto           text not null check (length(texto) between 1 and 40),
  cor             text not null default 'preto',      -- vermelho, preto, verde ou #hex
  peso            numeric not null default 1 check (peso >= 0),  -- chance relativa; 0 = enfeite, nunca sai
  e_premio        boolean not null default true,      -- false para "Tente Novamente"
  ativo           boolean not null default true,
  custo_estimado  numeric(10,2) not null default 0    -- custo para a loja quando resgatado (R$)
);

-- Pessoas que acessam o painel
create table if not exists public.equipe (
  user_id  uuid primary key references auth.users on delete cascade,
  nome     text not null,
  papel    text not null check (papel in ('dono', 'balcao')),
  ativo    boolean not null default true
);

-- Leads (1 por celular) + cupom
create table if not exists public.leads (
  id                    bigint generated always as identity primary key,
  criado_em             timestamptz not null default now(),
  nome                  text not null,
  celular               text not null unique,          -- só dígitos: 14999998888
  origem                text not null default 'direto',
  consentimento_texto   text not null,
  consentimento_versao  text not null,
  consentimento_em      timestamptz not null default now(),
  premio_id             bigint references public.premios(id) on delete set null,
  premio_texto          text not null,
  ganhou                boolean not null,
  codigo                text unique,
  validade              date,
  status                text not null check (status in ('gerado', 'resgatado', 'sem_premio', 'cancelado')),
  resgatado_em          timestamptz,
  resgatado_por         uuid references auth.users on delete set null,
  resgatado_por_nome    text,
  custo_premio          numeric(10,2) not null default 0,
  descadastrado_em      timestamptz,
  observacao            text
);
create index if not exists leads_criado_em_idx on public.leads (criado_em desc);
create index if not exists leads_origem_idx on public.leads (origem);

-- Prêmios iniciais (só entra se a tabela estiver vazia)
insert into public.premios (ordem, texto, cor, peso, e_premio, custo_estimado)
select * from (values
  (1, '10% de Desconto', 'vermelho', 3, true,  0),
  (2, 'Brinde Surpresa', 'preto',    2, true,  0),
  (3, 'Frete Grátis',    'vermelho', 3, true,  0),
  (4, 'Tente Novamente', 'verde',    3, false, 0),
  (5, 'Cupom R$20',      'preto',    1, true,  20),
  (6, '10% de Desconto', 'vermelho', 3, true,  0),
  (7, 'Frete Grátis',    'preto',    3, true,  0),
  (8, 'Tente Novamente', 'verde',    3, false, 0)
) as v(ordem, texto, cor, peso, e_premio, custo_estimado)
where not exists (select 1 from public.premios);

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES AUXILIARES
-- ---------------------------------------------------------------------
create or replace function public.eh_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from equipe where user_id = auth.uid() and ativo);
$$;

create or replace function public.eh_dono() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from equipe where user_id = auth.uid() and ativo and papel = 'dono');
$$;

-- Status real do cupom (vence no fim do dia da validade, horário de Brasília)
create or replace function public.status_efetivo(p_status text, p_validade date) returns text
language sql stable as $$
  select case
    when p_status = 'gerado' and p_validade < (now() at time zone 'America/Sao_Paulo')::date then 'expirado'
    else p_status end;
$$;

create or replace function public.lead_json(l public.leads, p_ja_girou boolean) returns json
language sql stable as $$
  select json_build_object(
    'ok', true,
    'jaGirou', p_ja_girou,
    'premioId', l.premio_id,
    'premio', l.premio_texto,
    'ganhou', l.ganhou,
    'codigo', l.codigo,
    'validade', to_char(l.validade, 'DD/MM/YYYY'),
    'status', public.status_efetivo(l.status, l.validade),
    'nome', l.nome
  );
$$;

-- Visão usada pelo painel (respeita as regras de acesso de quem consulta)
create or replace view public.leads_painel with (security_invoker = true) as
  select l.*, public.status_efetivo(l.status, l.validade) as status_atual
  from public.leads l;

-- ---------------------------------------------------------------------
-- 3. FUNÇÕES PÚBLICAS (página da roleta)
-- ---------------------------------------------------------------------
create or replace function public.dados_publicos() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ok', true,
    'campanhaAtiva', c.campanha_ativa,
    'premios', coalesce((
      select json_agg(json_build_object('id', p.id, 'texto', p.texto, 'cor', p.cor) order by p.ordem, p.id)
      from premios p where p.ativo), '[]'::json),
    'linkGoogle', c.link_google,
    'consentimentoTexto', c.consentimento_texto,
    'regras', c.regras,
    'validadeDias', c.validade_dias
  ) from config c where c.id = 1;
$$;

create or replace function public.girar(p_nome text, p_celular text, p_origem text, p_consentimento boolean)
returns json language plpgsql volatile security definer set search_path = public as $$
declare
  c          config;
  v_nome     text;
  v_dig      text;
  v_origem   text;
  v_lead     leads;
  v_total    numeric;
  v_x        numeric;
  v_p        premios;
  v_achou    boolean := false;
  v_codigo   text;
  v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- sem 0/O/1/I
  i          int;
begin
  select * into c from config where id = 1;
  if not c.campanha_ativa then
    return json_build_object('ok', false, 'erro', 'Esta promoção está encerrada no momento.');
  end if;

  v_nome   := left(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), 80);
  v_dig    := regexp_replace(coalesce(p_celular, ''), '\D', '', 'g');
  v_origem := coalesce(nullif(left(regexp_replace(coalesce(p_origem, ''), '[^A-Za-z0-9_-]', '', 'g'), 30), ''), 'direto');

  if length(v_nome) < 5 or position(' ' in v_nome) = 0 then
    return json_build_object('ok', false, 'erro', 'Digite nome e sobrenome.');
  end if;
  if length(v_dig) <> 11 or substr(v_dig, 3, 1) <> '9' then
    return json_build_object('ok', false, 'erro', 'Celular inválido. Use DDD + 9 dígitos.');
  end if;
  if p_consentimento is not true then
    return json_build_object('ok', false, 'erro', 'É preciso aceitar a autorização para participar.');
  end if;

  -- Trava por celular: dois toques simultâneos não geram dois giros
  perform pg_advisory_xact_lock(hashtext(v_dig));

  select * into v_lead from leads where celular = v_dig;
  if found then
    return lead_json(v_lead, true);
  end if;

  -- Sorteio ponderado pelo peso
  select coalesce(sum(peso), 0) into v_total from premios where ativo;
  if v_total <= 0 then
    return json_build_object('ok', false, 'erro', 'A roleta está em manutenção. Tente mais tarde.');
  end if;
  v_x := random() * v_total;
  for v_p in select * from premios where ativo order by ordem, id loop
    v_x := v_x - v_p.peso;
    if v_x < 0 then v_achou := true; exit; end if;
  end loop;
  if not v_achou then
    select * into v_p from premios where ativo and peso > 0 order by ordem desc, id desc limit 1;
  end if;

  -- Código único do cupom
  if v_p.e_premio then
    loop
      v_codigo := c.prefixo_codigo || '-';
      for i in 1..5 loop
        v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
      end loop;
      exit when not exists (select 1 from leads where codigo = v_codigo);
    end loop;
  end if;

  insert into leads (nome, celular, origem, consentimento_texto, consentimento_versao,
                     premio_id, premio_texto, ganhou, codigo, validade, status, custo_premio)
  values (v_nome, v_dig, v_origem, c.consentimento_texto, c.consentimento_versao,
          v_p.id, v_p.texto, v_p.e_premio, v_codigo,
          case when v_p.e_premio then (now() at time zone 'America/Sao_Paulo')::date + c.validade_dias end,
          case when v_p.e_premio then 'gerado' else 'sem_premio' end,
          v_p.custo_estimado)
  returning * into v_lead;

  return lead_json(v_lead, false);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. FUNÇÕES DO PAINEL (exigem login)
-- ---------------------------------------------------------------------
create or replace function public.resgatar(p_codigo text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare
  v_lead leads;
  v_st   text;
begin
  if not eh_equipe() then
    return json_build_object('ok', false, 'erro', 'Seu usuário não tem permissão.');
  end if;
  select * into v_lead from leads where codigo = upper(trim(coalesce(p_codigo, ''))) for update;
  if not found then
    return json_build_object('ok', false, 'erro', 'Código não encontrado.');
  end if;
  v_st := status_efetivo(v_lead.status, v_lead.validade);
  if v_st <> 'gerado' then
    return json_build_object('ok', false, 'erro', 'Este cupom não pode ser resgatado. Situação: ' || v_st || '.');
  end if;
  update leads set status = 'resgatado', resgatado_em = now(), resgatado_por = auth.uid(),
         resgatado_por_nome = (select nome from equipe where user_id = auth.uid())
   where id = v_lead.id;
  return json_build_object('ok', true);
end;
$$;

-- Busca UM cupom por código exato ou celular exato (balcão não vê a lista inteira)
create or replace function public.buscar_cupom(p_termo text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_t   text := upper(trim(coalesce(p_termo, '')));
  v_dig text := regexp_replace(coalesce(p_termo, ''), '\D', '', 'g');
  v     leads_painel;
begin
  if not eh_equipe() then
    return json_build_object('ok', false, 'erro', 'Seu usuário não tem permissão.');
  end if;
  select * into v from leads_painel where codigo = v_t or (length(v_dig) = 11 and celular = v_dig) limit 1;
  if not found then
    return json_build_object('ok', true, 'cupom', null);
  end if;
  return json_build_object('ok', true, 'cupom', json_build_object(
    'id', v.id, 'nome', v.nome, 'celular', v.celular, 'premio_texto', v.premio_texto, 'codigo', v.codigo,
    'validade', v.validade, 'criado_em', v.criado_em, 'status_atual', v.status_atual,
    'resgatado_em', v.resgatado_em, 'resgatado_por_nome', v.resgatado_por_nome));
end;
$$;

-- Desfaz um resgate feito por engano (só dono)
create or replace function public.desfazer_resgate(p_lead_id bigint) returns json
language plpgsql volatile security definer set search_path = public as $$
begin
  if not eh_dono() then
    return json_build_object('ok', false, 'erro', 'Só o dono pode desfazer um resgate.');
  end if;
  update leads set status = 'gerado', resgatado_em = null, resgatado_por = null, resgatado_por_nome = null,
         observacao = trim(coalesce(observacao, '') || ' [resgate desfeito em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ']')
   where id = p_lead_id and status = 'resgatado';
  if not found then return json_build_object('ok', false, 'erro', 'Este cupom não está resgatado.'); end if;
  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. REGRAS DE ACESSO (RLS)
-- ---------------------------------------------------------------------
alter table public.config  enable row level security;
alter table public.premios enable row level security;
alter table public.equipe  enable row level security;
alter table public.leads   enable row level security;

-- Visitante anônimo não toca em nenhuma tabela
revoke all on public.config, public.premios, public.equipe, public.leads from anon;
revoke all on public.leads_painel from anon;

drop policy if exists config_ler on public.config;
drop policy if exists config_editar on public.config;
create policy config_ler    on public.config for select to authenticated using (eh_equipe());
create policy config_editar on public.config for update to authenticated using (eh_dono()) with check (eh_dono());

drop policy if exists premios_ler on public.premios;
drop policy if exists premios_inserir on public.premios;
drop policy if exists premios_editar on public.premios;
drop policy if exists premios_apagar on public.premios;
create policy premios_ler     on public.premios for select to authenticated using (eh_equipe());
create policy premios_inserir on public.premios for insert to authenticated with check (eh_dono());
create policy premios_editar  on public.premios for update to authenticated using (eh_dono()) with check (eh_dono());
create policy premios_apagar  on public.premios for delete to authenticated using (eh_dono());

drop policy if exists equipe_ler on public.equipe;
create policy equipe_ler on public.equipe for select to authenticated using (eh_equipe() or user_id = auth.uid());

drop policy if exists leads_ler on public.leads;
drop policy if exists leads_editar on public.leads;
drop policy if exists leads_apagar on public.leads;
-- Lista completa de leads: só o dono. O balcão usa buscar_cupom() e resgatar().
create policy leads_ler    on public.leads for select to authenticated using (eh_dono());
create policy leads_editar on public.leads for update to authenticated using (eh_dono()) with check (eh_dono());
create policy leads_apagar on public.leads for delete to authenticated using (eh_dono());

-- Pela edição direta, o dono só altera descadastro e observação.
-- Status/resgate muda apenas pelas funções resgatar() e desfazer_resgate().
revoke insert, update on public.leads from authenticated;
grant update (descadastrado_em, observacao) on public.leads to authenticated;

-- Permissões das funções
revoke execute on function public.dados_publicos() from public;
revoke execute on function public.girar(text, text, text, boolean) from public;
revoke execute on function public.resgatar(text) from public, anon;
revoke execute on function public.desfazer_resgate(bigint) from public, anon;
revoke execute on function public.buscar_cupom(text) from public, anon;
revoke execute on function public.lead_json(public.leads, boolean) from public, anon, authenticated;

grant execute on function public.dados_publicos() to anon, authenticated;
grant execute on function public.girar(text, text, text, boolean) to anon, authenticated;
grant execute on function public.resgatar(text) to authenticated;
grant execute on function public.desfazer_resgate(bigint) to authenticated;
grant execute on function public.buscar_cupom(text) to authenticated;
grant execute on function public.eh_equipe(), public.eh_dono(), public.status_efetivo(text, date) to anon, authenticated;
