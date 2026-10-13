# Jogos Di Forni — Guia

Plataforma de jogos para captar clientes: **roleta**, **raspadinha** e **caixa surpresa**.
O cliente abre o link ou o QR Code, informa nome e celular, aceita a autorização (LGPD) e joga.
Não precisa de conta nem de aplicativo.

Tudo roda num servidor próprio, sem serviços de terceiros: Node.js com um banco SQLite num arquivo só.

## O que tem aqui
| Arquivo | Para quê |
|---|---|
| `server.js` | Servidor: páginas, sorteio, cupons, painel |
| `db.js` | Banco de dados (cria as tabelas e os 3 jogos iniciais sozinho) |
| `public/` | Páginas: início (`/`), jogo (`/j/roleta`), painel (`/painel`) |
| `teste.js` | Testes automáticos (`npm test`) |
| `dados/jogos.db` | Criado ao rodar: **todos os dados ficam aqui. Faça backup!** |

## Rodar no computador (para testar)
Precisa do Node.js 22.5 ou mais novo (nodejs.org).
```bash
cd jogos-diforni
npm run usuario -- dono seu@email.com SuaSenhaForte Gustavo   # cria o dono
npm start                                                     # abre em http://localhost:3000
```
- Jogos: http://localhost:3000
- Painel: http://localhost:3000/painel

## Colocar no ar
Qualquer hospedagem que rode Node.js 22 e **mantenha arquivos no disco** serve:
- **VPS** (Hostinger, DigitalOcean, Contabo, a partir de ~R$ 25/mês): o caminho mais barato e completo.
- **Railway** ou **Render**: só funcionam com um *volume/disco persistente* ligado (no plano grátis do Render os dados se perdem a cada reinício).

Passos numa VPS (Ubuntu):
```bash
# 1. Instalar Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs git
# 2. Baixar o projeto
git clone https://github.com/luizprudente/App_Estoque.git && cd App_Estoque/jogos-diforni
# 3. Criar o dono e subir mantendo ligado
npm run usuario -- dono seu@email.com SuaSenhaForte Gustavo
sudo npm i -g pm2 && pm2 start npm --name jogos -- start && pm2 save && pm2 startup
```
4. **HTTPS:** instale o Caddy (`sudo apt install caddy`) e coloque em `/etc/caddy/Caddyfile`:
   ```
   jogos.SEUDOMINIO.com.br {
     reverse_proxy localhost:3000
   }
   ```
   Depois rode `sudo systemctl reload caddy`. O certificado sai sozinho. No DNS do domínio, aponte `jogos` para o IP da VPS.
5. Rode o servidor com `TRUST_PROXY=1` (o pm2 aceita: `TRUST_PROXY=1 pm2 restart jogos --update-env`).
   Assim o limite de tentativas por pessoa e o cookie seguro funcionam atrás do Caddy.

### Variáveis opcionais
| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | 3000 | Porta do servidor |
| `DB_FILE` | `dados/jogos.db` | Onde fica o banco |
| `TRUST_PROXY` | desligado | Use `1` quando houver Caddy/Nginx/Render na frente |

### Backup
Copie o arquivo `dados/jogos.db` (e `jogos.db-wal`, se existir) para outro lugar todo dia. Exemplo, com cron:
```bash
0 4 * * * sqlite3 ~/App_Estoque/jogos-diforni/dados/jogos.db ".backup '/home/ubuntu/backup/jogos-$(date +\%F).db'"
```

## Antes de divulgar
1. Entre no painel → **Configurações**: preencha CNPJ, razão social e contato de privacidade.
   Revise o texto de autorização e as regras (de preferência com o contador ou advogado).
2. **Jogos e prêmios**: ajuste prêmios, chances e custo de cada prêmio. Desligue o que não for usar.
3. **Equipe**: adicione os atendentes com papel *Balcão*.
4. **Teste:** jogue com seu celular → busque o código na aba Balcão → resgate → desfaça como dono → apague o lead de teste em Leads.
5. **Links e QR Codes**: escolha o jogo e a origem (caixa-pizza, mesa, instagram…) e baixe o QR Code de cada uma.

## Regras do sistema
- O sorteio acontece no servidor. O jogo na tela só mostra o resultado, então não dá para trapacear pelo navegador.
- Uma jogada por celular em cada jogo. Se o número já jogou, o site **não** mostra nome nem cupom
  (quem digitar o celular de outra pessoa não vê os dados dela). O cliente recupera o cupom no balcão, pelo celular.
- **Balcão:** busca um cupom por código ou celular e resgata. Não vê a lista de clientes.
- **Dono:** vê e exporta leads, descadastra, apaga, desfaz resgate, edita jogos, prêmios, configurações e equipe.
- O cupom vence no fim do dia da validade (horário de Brasília).
- Cada lead guarda o texto e a versão da autorização que aceitou (LGPD). Mudou o texto → nova versão automática.
- A avaliação no Google é um convite opcional depois do jogo, sem relação com o prêmio.
