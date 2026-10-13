# Roleta de Leads Di Forni — Guia de instalação

## O que tem aqui
| Arquivo | Para quê |
|---|---|
| `supabase/schema.sql` | Banco: tabelas, regras de acesso, sorteio, resgate. Rodar 1 vez. |
| `index.html` | Página pública da roleta (cliente) |
| `painel.html` | Painel da equipe (login): balcão, leads, indicadores, prêmios, campanha |
| `config.js` | Endereço e chave pública do Supabase + dados do aviso de privacidade |

## Passo a passo
1. **Criar o projeto no Supabase** (supabase.com) com o e-mail da empresa. Região: São Paulo (sa-east-1).
2. **Banco:** SQL Editor → colar `supabase/schema.sql` inteiro → Run.
3. **Chaves:** Project Settings → API → copiar *Project URL* e a chave *anon public* para `config.js`. Nunca use a chave *service_role* no site.
4. **Completar `config.js`:** CNPJ e contato de privacidade.
5. **Criar usuários do painel:** Authentication → Users → Add user (e-mail + senha, marcar *Auto confirm*). Depois, no SQL Editor:
   ```sql
   insert into equipe (user_id, nome, papel)
   select id, 'Gustavo', 'dono' from auth.users where email = 'SEU_EMAIL';
   insert into equipe (user_id, nome, papel)
   select id, 'Nome do atendente', 'balcao' from auth.users where email = 'EMAIL_DO_ATENDENTE';
   ```
   Para bloquear alguém que saiu: `update equipe set ativo = false where nome = 'Fulano';`
6. **Desligar cadastro aberto:** Authentication → Sign In / Providers → desativar *Allow new users to sign up*.
7. **Publicar o site** (Netlify, Vercel ou Cloudflare Pages, plano gratuito) com os 3 arquivos da raiz e apontar o subdomínio `roleta.SEUDOMINIO.com.br`.
8. **Testar antes de divulgar:** girar com seu celular → buscar o código no painel → resgatar → desfazer como dono → apagar o lead de teste.
9. **QR Codes:** aba Campanha do painel → copiar o link de cada origem (caixa-pizza, mesa, instagram…) e gerar o QR.

## Regras do sistema
- Sorteio, limite de 1 giro por celular e código do cupom são definidos no banco; a página só exibe.
- Balcão: busca um cupom por código ou celular e resgata. Não vê a lista de clientes.
- Dono: vê e exporta leads, descadastra, desfaz resgate, edita prêmios e campanha.
- A avaliação no Google é um convite opcional após o giro, sem relação com o prêmio.
- Cada lead guarda o texto e a versão do consentimento que aceitou (LGPD).

## Pendências antes de ir ao ar
- Confirmar o endereço da biblioteca `@supabase/supabase-js@2.45.4` (`dist/umd/supabase.js`) — não foi possível baixá-la neste ambiente.
- Revisar o aviso de privacidade e o texto de consentimento com o contador ou advogado.
- Definir custo de cada prêmio na aba Prêmios para os indicadores de custo por lead.
